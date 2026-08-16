import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { AI_MODEL } from "./server/ai";

import multer from "multer";

// Importar firebase-admin
import { initializeApp as initializeAdminApp, cert } from "firebase-admin/app";
import { getStorage as getAdminStorage } from "firebase-admin/storage";
import { getFirestore as getAdminFirestore, FieldValue } from "firebase-admin/firestore";

dotenv.config();

const app = express();
const PORT = 3000;

// Leer configuración de Firebase para el bucket
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseConfig: any = {};
if (fs.existsSync(firebaseConfigPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
  } catch (e) {
    console.error("Error al leer firebase-applet-config.json:", e);
  }
}

// Inicializar Firebase Admin
let bucket: any;
let dbAdmin: any;

try {
  if (firebaseConfig.projectId) {
    initializeAdminApp({
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket || `${firebaseConfig.projectId}.firebasestorage.app`
    });
    
    bucket = getAdminStorage().bucket();
    // Usar el databaseId específico si existe en el config
    dbAdmin = getAdminFirestore(firebaseConfig.firestoreDatabaseId || undefined);
    console.log(`[FIREBASE] Admin inicializado para proyecto: ${firebaseConfig.projectId}`);
  } else {
    console.warn("[FIREBASE] No se encontró projectId en la configuración.");
  }
} catch (e) {
  console.log("[FIREBASE] Admin ya estaba inicializado o falló:", e);
  bucket = getAdminStorage().bucket();
  dbAdmin = getAdminFirestore(firebaseConfig.firestoreDatabaseId || undefined);
}

// Función para asegurar que el bucket existe (probando fallbacks y variantes comunes en AI Studio)
async function ensureBucketAccess() {
  if (!bucket) return;
  
  const possibleNames = [
    bucket.name,
    firebaseConfig.storageBucket,
    `${firebaseConfig.projectId}.firebasestorage.app`,
    `${firebaseConfig.projectId}.appspot.com`,
    `amazing-eon-mt8c4.firebasestorage.app`,
    `amazing-eon-mt8c4.appspot.com`,
    `ai-studio-remixcasimscerca-f5a96113-8c63-4edc-a401-af606010f7d4.firebasestorage.app`,
    `ai-studio-remixcasimscerca-f5a96113-8c63-4edc-a401-af606010f7d4.appspot.com`,
    `500685140254.appspot.com`
  ].filter((v, i, a) => v && a.indexOf(v) === i); // Únicos y definidos

  for (const name of possibleNames) {
    try {
      console.log(`[STORAGE] Verificando bucket: ${name}`);
      const testBucket = getAdminStorage().bucket(name);
      
      // En lugar de exists(), intentamos algo que no requiera permisos de administración de buckets si es posible
      // Pero para verificar si el nombre es válido, intentamos una operación mínima
      const [exists] = await testBucket.exists();
      if (exists) {
        bucket = testBucket;
        console.log(`[STORAGE] ¡Bucket encontrado y verificado!: ${bucket.name}`);
        return;
      }
    } catch (err: any) {
      console.log(`[STORAGE] Error verificando ${name}: ${err.message}`);
    }
  }
  
  // Si llegamos aquí y el principal es el de config, lo dejamos como último recurso aunque exists() fallara
  if (firebaseConfig.storageBucket) {
    bucket = getAdminStorage().bucket(firebaseConfig.storageBucket);
    console.warn(`[STORAGE] No se pudo verificar la existencia con exists(), usando predeterminado de config: ${bucket.name}`);
  }
}

ensureBucketAccess();

// Directorio para almacenar archivos subidos (temporal en Cloud Run)
const UPLOADS_DIR = "/tmp/uploads";
const CHUNKS_DIR = "/tmp/chunks";

function ensureDirs() {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      console.log(`[STORAGE] Creado directorio: ${UPLOADS_DIR}`);
    }
    if (!fs.existsSync(CHUNKS_DIR)) {
      fs.mkdirSync(CHUNKS_DIR, { recursive: true });
      console.log(`[STORAGE] Creado directorio de chunks: ${CHUNKS_DIR}`);
    }
  } catch (e) {
    console.warn("[STORAGE] Error asegurando directorios:", e);
  }
}

ensureDirs();

// Configuración de multer para chunks usando diskStorage para evitar el paso de mover archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDirs();
    cb(null, CHUNKS_DIR);
  },
  filename: (req, file, cb) => {
    const uploadId = req.body.uploadId?.toString().trim() || "unknown";
    const chunkIndex = req.body.chunkIndex || "0";
    cb(null, `${uploadId}_${chunkIndex}`);
  }
});

const chunkUpload = multer({ storage });

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// NUEVO: Manejador para descargar archivos desde Firestore (persistencia de emergencia)
app.get("/api/files/download/:fileId", async (req, res) => {
  const { fileId } = req.params;
  
  if (!dbAdmin) {
    return res.status(500).send("Servicio de base de datos no disponible.");
  }

  try {
    const doc = await dbAdmin.collection("file_contents").doc(fileId).get();
    
    if (!doc.exists) {
      return res.status(404).send("Archivo no encontrado en persistencia.");
    }

    const data = doc.data();
    const buffer = Buffer.from(data.content, "base64");
    
    res.setHeader("Content-Type", data.type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${data.name}"`);
    res.send(buffer);
  } catch (error) {
    console.error("Error al descargar archivo de Firestore:", error);
    res.status(500).send("Error interno al recuperar el archivo.");
  }
});

// NUEVO: Manejador robusto para archivos locales (fallback de storage)
app.get("/uploads/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(UPLOADS_DIR, filename);
  
  if (fs.existsSync(filePath)) {
    console.log(`[STORAGE] Sirviendo archivo local: ${filename}`);
    // Intentar deducir el tipo de contenido si es posible
    res.sendFile(filePath);
  } else {
    console.warn(`[STORAGE] Archivo no encontrado en fallback local: ${filename}`);
    res.status(404).send("Archivo no encontrado.");
  }
});

// Endpoint para recibir un trozo (chunk) de archivo
app.post("/api/upload/chunk", chunkUpload.single("chunk"), (req, res) => {
  try {
    const uploadId = req.body.uploadId?.toString().trim();
    const chunkIndex = req.body.chunkIndex;
    
    if (!uploadId || chunkIndex === undefined || !req.file) {
      console.warn("[STORAGE] Chunk recibido incompleto o sin archivo:", req.body, !!req.file);
      return res.status(400).json({ error: "Faltan metadatos o archivo del trozo." });
    }
    
    const finalChunkPath = req.file.path;
    console.log(`[STORAGE] Trozo ${chunkIndex} guardado en: ${finalChunkPath}`);

    if (!fs.existsSync(finalChunkPath)) {
      throw new Error("No se pudo confirmar el guardado del trozo en disco.");
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error en /api/upload/chunk:", error);
    res.status(500).json({ error: "Error al procesar el trozo: " + error.message });
  }
});

// Endpoint para completar la subida de trozos y PERSISTIR en Firebase Storage
app.post("/api/upload/complete", async (req, res) => {
  try {
    const { name, mimeType, totalChunks, moduleId } = req.body;
    const uploadId = req.body.uploadId?.toString().trim();
    
    if (!uploadId) {
      return res.status(400).json({ error: "Falta el ID de subida." });
    }

    const numChunks = parseInt(totalChunks);
    console.log(`[STORAGE] Completando subida ${uploadId} (${numChunks} trozos) para módulo ${moduleId}`);

    const finalPath = path.join(UPLOADS_DIR, `final_${uploadId}`);
    
    // Limpiar si ya existe un residuo anterior
    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);

    // Reensamblado con pequeños reintentos si falla la lectura inicial
    for (let i = 0; i < numChunks; i++) {
      const chunkPath = path.join(CHUNKS_DIR, `${uploadId}_${i}`);
      
      // Reintento por si hay latencia de escritura
      let attempts = 0;
      const maxAttempts = 20;
      while (!fs.existsSync(chunkPath) && attempts < maxAttempts) {
        console.log(`[STORAGE] Esperando trozo ${i} para ${uploadId} (intento ${attempts + 1}/${maxAttempts}) en ${chunkPath}`);
        await new Promise(r => setTimeout(r, 300));
        attempts++;
      }

      if (!fs.existsSync(chunkPath)) {
        const allFiles = fs.readdirSync(CHUNKS_DIR);
        const relatedFiles = allFiles.filter(f => f.includes(uploadId));
        console.error(`[STORAGE] ERROR CRÍTICO: Falta trozo ${i} en ${chunkPath}`);
        console.error(`[STORAGE] Archivos con ID similar en ${CHUNKS_DIR}:`, relatedFiles);
        console.error(`[STORAGE] Chunks dir content (primeros 10):`, allFiles.slice(0, 10));
        
        throw new Error(`Falta el trozo ${i} de la subida. El servidor recibió ${relatedFiles.length} trozos para este ID, pero no el ${i}.`);
      }

      const content = fs.readFileSync(chunkPath);
      fs.appendFileSync(finalPath, content);
      
      // Borrar chunk tras leerlo
      try { fs.unlinkSync(chunkPath); } catch (e) {}
    }

    const fileSize = fs.statSync(finalPath).size;
    console.log(`[STORAGE] Archivo reensamblado con éxito: ${fileSize} bytes. Subiendo a Firebase...`);

    // Subir a Firebase Storage para persistencia real
    const timestamp = Date.now();
    const destination = `modules/${moduleId || 'general'}/${timestamp}_${name}`;
    console.log(`[STORAGE] Intentando subir a Firebase Storage: ${destination}`);
    
    const uploadOptions = {
      destination,
      metadata: { 
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000'
      }
    };

    const possibleNames = [
      bucket.name,
      firebaseConfig.storageBucket,
      `${firebaseConfig.projectId}.firebasestorage.app`,
      `${firebaseConfig.projectId}.appspot.com`,
      `amazing-eon-mt8c4.firebasestorage.app`,
      `amazing-eon-mt8c4.appspot.com`,
      `ai-studio-remixcasimscerca-f5a96113-8c63-4edc-a401-af606010f7d4.firebasestorage.app`,
      `ai-studio-remixcasimscerca-f5a96113-8c63-4edc-a401-af606010f7d4.appspot.com`,
      `500685140254.appspot.com`,
      `500685140254.firebasestorage.app`
    ];

    let uploadSuccess = false;
    try {
      // Intentar subir al bucket actual
      try {
        if (bucket) {
          await bucket.upload(finalPath, uploadOptions);
          uploadSuccess = true;
        }
      } catch (uploadErr: any) {
        // gRPC error code 5 is NOT_FOUND, HTTP 404 is also NOT_FOUND
        const isNotFound = uploadErr.code === 404 || uploadErr.code === 5 || 
                          (uploadErr.message && (uploadErr.message.includes('not exist') || uploadErr.message.includes('NOT_FOUND')));
        
        if (isNotFound) {
          console.log(`[STORAGE] Bucket inicial no encontrado (${uploadErr.code}). Probando variantes...`);
          
          for (const name of possibleNames) {
            if (!name || (bucket && name === bucket.name)) continue;
            try {
              const tryBucket = getAdminStorage().bucket(name);
              await tryBucket.upload(finalPath, uploadOptions);
              bucket = tryBucket; 
              uploadSuccess = true;
              console.log(`[STORAGE] ¡Subida exitosa a bucket alternativo!: ${name}`);
              break;
            } catch (e) {
              // Silenciosamente intentar el siguiente
            }
          }
        } else {
          // No es un error de "no encontrado", loguear pero no interrumpir para permitir fallbacks
          console.error(`[STORAGE] Error inesperado al subir a Firebase:`, uploadErr);
        }
      }
      
      if (uploadSuccess && bucket) {
        console.log(`[STORAGE] Upload exitoso a Firebase Storage: ${destination}`);
        // No los hacemos públicos para respetar la privacidad solicitada
        // await bucket.file(destination).makePublic().catch((e: any) => { ... });
      }
    } catch (finalErr: any) {
      console.error(`[STORAGE] Fallo crítico en el bloque de subida a Firebase:`, finalErr.message || finalErr);
    }

    // URL de retorno
    let publicUrl: string;
    
    if (uploadSuccess) {
      const encodedPath = encodeURIComponent(destination);
      publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media`;
    } else {
      // INTENTO DE PERSISTENCIA EN FIRESTORE (para archivos < 1MB)
      try {
        const stats = fs.statSync(finalPath);
        const fileSizeInBytes = stats.size;
        const MAX_FIRESTORE_SIZE = 1000000; // ~1MB

        if (fileSizeInBytes < MAX_FIRESTORE_SIZE && dbAdmin) {
          console.log(`[STORAGE] Archivo pequeño detectado (${fileSizeInBytes} bytes). Guardando en Firestore para persistencia.`);
          const fileBuffer = fs.readFileSync(finalPath);
          const base64Content = fileBuffer.toString("base64");
          
          await dbAdmin.collection("file_contents").doc(uploadId).set({
            name,
            type: mimeType,
            content: base64Content,
            createdAt: FieldValue.serverTimestamp()
          });
          
          publicUrl = `/api/files/download/${uploadId}`;
          uploadSuccess = true;
        } else {
          throw new Error(fileSizeInBytes >= MAX_FIRESTORE_SIZE ? "Archivo muy grande para Firestore" : "dbAdmin no disponible");
        }
      } catch (fallbackErr: any) {
        // FALLBACK LOCAL: Si Firebase falla y Firestore también (o es muy grande)
        console.warn(`[STORAGE] Usando FALLBACK LOCAL (efímero) debido a: ${fallbackErr.message}`);
        const localFileName = `${uploadId}_${name.replace(/\s+/g, '_')}`;
        const localPath = path.join(UPLOADS_DIR, localFileName);
        fs.copyFileSync(finalPath, localPath);
        publicUrl = `/uploads/${localFileName}`;
      }
    }
    
    console.log(`[STORAGE] Proceso de subida finalizado: ${publicUrl}`);

    // Limpiar archivo temporal
    try { fs.unlinkSync(finalPath); } catch (e) {}

    res.json({
      success: true,
      url: publicUrl,
      name: name,
      size: fileSize
    });
  } catch (error: any) {
    console.error("[STORAGE] Error en /api/upload/complete:", error);
    res.status(500).json({ error: error.message || "Error al persistir el archivo." });
  }
});

// Endpoint para descargar o servir un archivo (por si se necesitan proxies)
app.get("/api/files/:fileId", async (req, res) => {
  res.status(400).send("Usa la URL directa de Storage.");
});

// Endpoint para eliminar archivo de Storage
app.delete("/api/files/storage", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.includes("storage.googleapis.com")) {
      return res.status(400).json({ error: "URL inválida." });
    }

    // Extraer ruta del archivo
    const bucketName = bucket.name;
    const startIndex = url.indexOf(bucketName) + bucketName.length + 1;
    const filePath = url.substring(startIndex);

    console.log(`[STORAGE] Eliminando de Firebase Storage: ${filePath}`);
    await bucket.file(filePath).delete();
    
    res.json({ success: true });
  } catch (error: any) {
    console.error(`[STORAGE] Error al eliminar de Storage:`, error);
    res.status(500).json({ error: "Error al eliminar archivo: " + error.message });
  }
});

// Error handler para multer
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    console.error("Multer Error:", err);
    return res.status(400).json({ error: `Error de subida: ${err.message}` });
  } else if (err) {
    console.error("General Error:", err);
    return res.status(500).json({ error: err.message });
  }
  next();
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind to port 3000 and host 0.0.0.0 (REQUIRED for AI Studio)
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Uploads directory: ${UPLOADS_DIR}`);
  });
}

startServer().catch((err) => {
  console.error("Error starting server:", err);
});

export default app;
