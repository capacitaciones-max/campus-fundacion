
import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Upload, 
  FileText, 
  Video, 
  Monitor, 
  AlertCircle, 
  CheckCircle, 
  Loader2,
  ExternalLink,
  Trash2,
  Image,
  LogIn,
  Clock,
  RefreshCw
} from 'lucide-react';
import { LearningModule, ModuleFile, FileType } from '../types';
import { auth, db, storage, handleFirestoreError, OperationType, checkTeacherStatus } from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  deleteDoc, 
  doc,
  getDocFromServer,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

interface ModuleDetailsProps {
  module: LearningModule;
  onBack: () => void;
  isCompleted: boolean;
  onToggleComplete: () => void;
}

export default function ModuleDetails({ module, onBack, isCompleted, onToggleComplete }: ModuleDetailsProps) {
  const [files, setFiles] = useState<ModuleFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [isAuthorizedStudent, setIsAuthorizedStudent] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<ModuleFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Monitorear estado de autenticación y autorización en tiempo real
  useEffect(() => {
    let unsubStudentDoc: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user?.email) {
        setIsTeacher(false);
        setIsAuthorizedStudent(false);
        if (unsubStudentDoc) {
          unsubStudentDoc();
          unsubStudentDoc = null;
        }
        return;
      }

      const teacherStatus = await checkTeacherStatus(user.email);
      setIsTeacher(teacherStatus);
      
      if (teacherStatus) {
        setIsAuthorizedStudent(true);
        return;
      }

      const emailLower = user.email.toLowerCase();
      // Si pertenece al dominio de la fundación / empresa
      if (emailLower.endsWith('@crucianelli.com') || emailLower.endsWith('@fundacioncrucianelli.com')) {
        setIsAuthorizedStudent(true);
        return;
      }

      // Suscripción en tiempo real a la colección de alumnos para que al ser aprobado se desbloquee al instante
      unsubStudentDoc = onSnapshot(doc(db, 'students', emailLower), async (docSnap) => {
        if (docSnap.exists()) {
          setIsAuthorizedStudent(true);
        } else {
          setIsAuthorizedStudent(false);
          // Registrar automáticamente la solicitud pendiente
          try {
            await setDoc(doc(db, 'access_requests', emailLower), {
              email: emailLower,
              name: user.displayName || null,
              photoURL: user.photoURL || null,
              requestedAt: serverTimestamp(),
              status: 'pending'
            }, { merge: true });
          } catch (err) {
            console.error("Error al registrar solicitud de acceso:", err);
          }
        }
      }, (error) => {
        console.error("Error verificando autorización de alumno:", error);
      });
    });

    return () => {
      unsubscribe();
      if (unsubStudentDoc) unsubStudentDoc();
    };
  }, []);

  // Cargar archivos del módulo en tiempo real
  useEffect(() => {
    if (!module?.id) return;
    if (!currentUser) {
      setFiles([]);
      setLoadingFiles(false);
      return;
    }
    
    setLoadingFiles(true);
    const filesPath = `modules/${module.id}/files`;
    const q = query(
      collection(db, 'modules', module.id, 'files')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const filesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ModuleFile[];
        setFiles(filesData);
        setLoadingFiles(false);
      },
      (error) => {
        setLoadingFiles(false);
        console.error("Error en tiempo real de archivos:", error);
      }
    );

    return () => unsubscribe();
  }, [module.id, currentUser]);

  const getFileType = (fileName: string): FileType => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['mp4', 'mov', 'avi'].includes(ext || '')) return 'video';
    if (['ppt', 'pptx', 'key'].includes(ext || '')) return 'presentation';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'image';
    return 'other';
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);
      
      const user = auth.currentUser;
      if (!user) {
        alert("Debes iniciar sesión con Google para subir archivos.");
        throw new Error("Debes iniciar sesión para subir archivos.");
      }

      if (!isTeacher) {
        alert("Solo los docentes autorizados pueden subir archivos.");
        throw new Error("Permisos insuficientes.");
      }

      console.log("Iniciando subida por trozos al servidor:", file.name, file.size);
      
      // Aumentamos el tamaño del trozo a 5MB para reducir la probabilidad de fragmentación
      // y mejorar la velocidad en archivos medianos.
      const CHUNK_SIZE = 5 * 1024 * 1024; 
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // 1. Subir chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        // IMPORTANTE: Los campos de texto deben ir ANTES del archivo para que Multer los procese correctamente
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', i.toString());
        formData.append('totalChunks', totalChunks.toString());
        formData.append('chunk', chunk, file.name); // Usamos el nombre real para ayudar al servidor

        const response = await fetch('/api/upload/chunk', {
          method: 'POST',
          body: formData
        }).catch(err => {
          console.error(`Error de red en chunk ${i}:`, err);
          throw new Error("Error de conexión al subir el archivo. Por favor, verifica tu internet.");
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          console.error(`Error del servidor en chunk ${i}:`, errData);
          throw new Error(errData.error || `El servidor rechazó el trozo ${i}.`);
        }
        
        const progress = ((i + 1) / totalChunks) * 80;
        setUploadProgress(Math.round(progress));
      }

      // Pausa defensiva para asegurar que el sistema de archivos del servidor se asiente
      await new Promise(r => setTimeout(r, 800));

      // 2. Finalizar subida y persistir en Storage via Servidor
      console.log("Chunks enviados, completando en servidor...");
      setUploadProgress(85);

      const completeRes = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          name: file.name,
          mimeType: file.type,
          totalChunks,
          moduleId: module.id
        })
      });

      if (!completeRes.ok) {
        const errData = await completeRes.json().catch(() => ({}));
        throw new Error(errData.error || "Error al finalizar la subida en el servidor.");
      }

      const resData = await completeRes.json();
      const downloadUrl = resData.url;
      setUploadProgress(100);

      console.log("Archivo persistido con éxito via servidor:", downloadUrl);

      // 3. Guardar metadatos en Firestore
      const fileData: Omit<ModuleFile, 'id'> = {
        moduleId: module.id,
        name: file.name,
        url: downloadUrl,
        type: getFileType(file.name),
        uploadedAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'modules', module.id, 'files'), fileData);
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      console.error("Error al subir archivo:", error);
      alert(error?.message || "No se pudo subir el archivo.");
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1500);
    }
  };

  const handleDeleteFile = async () => {
    if (!fileToDelete) return;
    
    console.log("[DELETE] Ejecutando eliminación de archivo:", fileToDelete);
    
    if (!isTeacher) {
      alert("No tienes permisos para realizar esta acción.");
      setFileToDelete(null);
      return;
    }

    try {
      setIsDeleting(true);
      // 1. Eliminar primero de Firestore
      const cleanModuleId = String(module.id).trim();
      const cleanFileId = String(fileToDelete.id).trim();
      
      const fileDocRef = doc(db, 'modules', cleanModuleId, 'files', cleanFileId);
      console.log("[DELETE] Eliminando de Firestore en la ruta:", fileDocRef.path);
      
      await deleteDoc(fileDocRef);
      console.log("[DELETE] Registro eliminado con éxito de Firestore.");
      
      // 2. Eliminar de Storage via Servidor si es una URL de Storage
      if (fileToDelete.url.includes('storage.googleapis.com') || fileToDelete.url.includes('firebasestorage')) {
        console.log("[DELETE] Solicitando eliminación en Storage al servidor...");
        await fetch('/api/files/storage', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: fileToDelete.url })
        }).catch(e => console.warn("[DELETE] Error al intentar borrar en servidor:", e));
      } else if (fileToDelete.url.startsWith('/api/files/')) {
        // Soporte para archivos antiguos (retrocompatibilidad)
        const urlObj = new URL(fileToDelete.url, window.location.origin);
        const fileIdFromServer = urlObj.pathname.split('/').pop();
        
        if (fileIdFromServer) {
          console.log("[DELETE] Solicitando eliminación física al servidor para ID:", fileIdFromServer);
          const deleteRes = await fetch(`/api/files/${fileIdFromServer}`, { 
            method: 'DELETE',
            cache: 'no-store'
          });
          
          if (!deleteRes.ok) {
            const errorText = await deleteRes.text();
            console.warn("[DELETE] El servidor no pudo borrar el archivo físico:", errorText);
          } else {
            console.log("[DELETE] Archivo físico eliminado con éxito.");
          }
        }
      }
      
      setFileToDelete(null);
    } catch (error: any) {
      console.error("[DELETE] Error completo durante el proceso:", error);
      let errorMsg = "No se pudo eliminar el archivo.";
      if (error.code === 'permission-denied' || error.message?.includes('permission')) {
        errorMsg = "Error de permisos en Firestore. Asegúrate de tener tu sesión activa y ser docente.";
      } else if (error.message) {
        errorMsg += "\nDetalle: " + error.message;
      }
      alert(errorMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  const getIcon = (type: FileType) => {
    switch (type) {
      case 'pdf': return FileText;
      case 'video': return Video;
      case 'presentation': return Monitor;
      case 'image': return Image;
      default: return FileText;
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      {/* Botón Volver y Estado */}
      <div className="flex items-center justify-between mb-8">
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={onBack}
          className="flex items-center text-[#000033] font-semibold hover:underline"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Volver al Inicio
        </motion.button>

        <button 
          onClick={onToggleComplete}
          className={`flex items-center px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            isCompleted 
              ? 'bg-green-100 text-green-700 hover:bg-green-200' 
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {isCompleted ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Completado
            </>
          ) : (
            'Marcar como Completado'
          )}
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-[#000033] p-8 text-white">
          <span className="text-sm font-medium text-white/60 uppercase tracking-wider">Módulo {module.order}</span>
          <h2 className="text-3xl font-bold mt-1">{module.title}</h2>
        </div>

        <div className="p-8">
          {/* Lista de Archivos */}
          <div className="space-y-4">
            {loadingFiles ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-[#e31b23] animate-spin" />
                <p className="mt-4 text-gray-500 font-medium">Cargando materiales...</p>
              </div>
            ) : !currentUser ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <div className="p-6 bg-amber-50 rounded-full">
                  <LogIn className="w-12 h-12 text-amber-500" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-gray-800">Acceso Requerido</h4>
                  <p className="text-gray-500 max-w-md mx-auto mt-2">
                    Debes iniciar sesión con tu cuenta de Google para ver los materiales de este módulo.
                  </p>
                </div>
              </div>
            ) : (!isTeacher && !isAuthorizedStudent) ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 max-w-lg mx-auto">
                <div className="p-5 bg-amber-50 rounded-2xl border border-amber-200">
                  <Clock className="w-12 h-12 text-amber-600 animate-pulse" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-black uppercase tracking-wider mb-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Esperando Aprobación</span>
                  </div>
                  <h4 className="text-2xl font-black text-[#000033]">Solicitud de Acceso Enviada</h4>
                  <p className="text-gray-600 text-sm mt-3 leading-relaxed">
                    Hola <span className="font-bold text-gray-900">{currentUser.displayName || currentUser.email}</span>. Tu cuenta quedó registrada automáticamente en la lista de espera para el administrador.
                  </p>
                  <p className="text-gray-500 text-xs mt-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                    En cuanto el Administrador de la Fundación Crucianelli acepte tu solicitud, el contenido de este módulo y los materiales educativos se desbloquearán de forma instantánea.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={async () => {
                      if (!currentUser?.email) return;
                      const emailLower = currentUser.email.toLowerCase();
                      try {
                        const sDoc = await getDocFromServer(doc(db, 'students', emailLower));
                        if (sDoc.exists()) {
                          setIsAuthorizedStudent(true);
                        } else {
                          alert("Tu solicitud todavía está pendiente de aprobación por el Administrador.");
                        }
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-bold rounded-xl shadow-2xs hover:bg-gray-50 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Comprobar Estado</span>
                  </button>
                </div>
              </div>
            ) : files.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {files.map((file) => {
                  const Icon = getIcon(file.type);
                  return (
                    <motion.div 
                      key={file.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all"
                    >
                      <div className="flex items-center min-w-0 flex-1">
                        <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-[#e31b23]/5 transition-colors">
                          <Icon className="w-6 h-6 text-[#000033] group-hover:text-[#e31b23]" />
                        </div>
                        <div className="ml-4 truncate">
                          <p className="font-bold text-gray-800 truncate">{file.name}</p>
                          <p className="text-xs text-gray-400 font-medium">
                            {new Date(file.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 ml-4">
                        <a 
                          href={file.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-2 text-gray-400 hover:text-[#000033] hover:bg-gray-50 rounded-lg transition-all"
                          title="Ver archivo"
                        >
                          <ExternalLink className="w-5 h-5" />
                        </a>
                        {isTeacher && (
                          <button 
                            onClick={() => setFileToDelete(file)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Eliminar material"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <div className="p-6 bg-gray-50 rounded-full">
                  <AlertCircle className="w-12 h-12 text-gray-300" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-gray-800">No hay archivos disponibles</h4>
                  <p className="text-gray-500 max-w-md mx-auto mt-2">
                    Los docentes subirán el material de este módulo próximamente. 
                    Aquí podrás encontrar PDFs, presentaciones y videos del curso.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Zona Docente (Upload) - Solo visible para docentes autorizados */}
          <div className="mt-12 pt-12 border-t border-gray-100">
            {!currentUser ? (
              <div className="flex flex-col items-center justify-center p-6 bg-amber-50 rounded-2xl border border-amber-200">
                <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
                <p className="text-amber-800 font-bold">Acceso Restringido</p>
                <p className="text-sm text-amber-600 text-center mt-1">
                  Debes iniciar sesión con el botón "Acceso Docente" en la parte superior para subir materiales.
                </p>
              </div>
            ) : !isTeacher ? (
              <div className="flex flex-col items-center justify-center p-6 bg-blue-50 rounded-2xl border border-blue-200">
                <CheckCircle className="w-8 h-8 text-blue-500 mb-2" />
                <p className="text-blue-800 font-bold">Modo Alumno / Visitante</p>
                <p className="text-sm text-blue-600 text-center mt-1">
                  Hola <span className="font-bold">{currentUser.displayName || currentUser.email}</span>. 
                  Como alumno puedes ver y descargar los materiales, pero no subir nuevos archivos.
                </p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                <div className="flex items-center">
                  <Upload className="w-6 h-6 text-[#e31b23] mr-4" />
                  <div className="text-left">
                    <p className="font-bold text-gray-800">Zona Docente</p>
                    <p className="text-sm text-gray-500">Sesión activa como: <span className="text-[#e31b23]">{currentUser.email}</span></p>
                  </div>
                </div>
                
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  accept=".pdf,.ppt,.pptx,.key,.mp4,.mov,.avi,.jpg,.jpeg,.png,.gif,.webp"
                />

                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center px-6 py-2 bg-[#000033] text-white rounded-xl font-bold hover:bg-[#000044] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm min-w-[160px] justify-center"
                >
                  {isUploading ? (
                    <div className="flex items-center">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <span>{uploadProgress >= 85 ? "Procesando..." : `${uploadProgress}%`}</span>
                    </div>
                  ) : (
                    'Subir Material'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { 
            label: 'Documentos', 
            icon: FileText, 
            count: files.filter(f => ['pdf', 'presentation', 'other'].includes(f.type)).length,
            accept: ".pdf,.ppt,.pptx,.key"
          },
          { 
            label: 'Videos Explicativos', 
            icon: Video, 
            count: files.filter(f => f.type === 'video').length,
            accept: ".mp4,.mov,.avi"
          },
          { 
            label: 'Imágenes', 
            icon: Image, 
            count: files.filter(f => f.type === 'image').length,
            accept: ".jpg,.jpeg,.png,.gif,.webp"
          },
        ].map((item, idx) => (
          <button 
            key={idx} 
            onClick={() => {
              if (isTeacher && fileInputRef.current) {
                fileInputRef.current.accept = item.accept;
                fileInputRef.current.click();
              }
            }}
            className={`flex items-center p-4 bg-white rounded-xl border border-gray-100 shadow-sm transition-all ${
              item.count === 0 ? 'opacity-60' : 'opacity-100'
            } ${isTeacher ? 'hover:border-[#e31b23] hover:shadow-md' : 'cursor-default'}`}
          >
            <item.icon className="w-5 h-5 text-[#000033] mr-3" />
            <div className="text-left">
              <p className="text-sm font-bold text-gray-600">{item.label}</p>
              {item.count > 0 ? (
                <p className="text-[10px] text-[#e31b23] font-bold">{item.count} disponibles</p>
              ) : (
                <p className="text-[10px] text-gray-400 font-bold">Sin archivos</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Modal de Confirmación de Eliminación */}
      <AnimatePresence>
        {fileToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100"
            >
              <div className="flex flex-col items-center text-center">
                <div className="p-4 bg-red-50 rounded-full mb-6">
                  <Trash2 className="w-8 h-8 text-[#e31b23]" />
                </div>
                <h3 className="text-2xl font-black text-[#000033] mb-2">Eliminar Material</h3>
                <p className="text-gray-500 font-medium mb-8">
                  ¿Estás seguro de que deseas eliminar <span className="text-gray-900 font-bold">"{fileToDelete.name}"</span>? Esta acción no se puede deshacer.
                </p>
                
                <div className="flex gap-3 w-full">
                  <button 
                    onClick={() => setFileToDelete(null)}
                    disabled={isDeleting}
                    className="flex-1 px-6 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-all disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleDeleteFile}
                    disabled={isDeleting}
                    className="flex-1 px-6 py-3 rounded-xl bg-[#e31b23] text-white font-bold hover:bg-[#c4171e] transition-all shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center"
                  >
                    {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Eliminar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
