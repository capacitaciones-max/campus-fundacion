import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  FileText, 
  Video, 
  Download, 
  Upload, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Loader2,
  ExternalLink,
  Trash2,
  Image,
  LogIn,
  RefreshCw,
  Link as LinkIcon,
  Plus,
  X,
  Eye
} from 'lucide-react';
import { LearningModule, ModuleFile, FileType } from '../types';
import { auth, db, handleFirestoreError, OperationType, checkTeacherStatus } from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc,
  getDocFromServer,
  setDoc,
  getDocs,
  deleteDoc,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';

interface ModuleDetailsProps {
  module: LearningModule;
  onBack: () => void;
  isCompleted?: boolean;
  onToggleComplete?: () => void;
}

export default function ModuleDetails({ 
  module, 
  onBack, 
  isCompleted = false, 
  onToggleComplete 
}: ModuleDetailsProps) {
  const [files, setFiles] = useState<ModuleFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [isAuthorizedStudent, setIsAuthorizedStudent] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<ModuleFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  
  // Modal para agregar enlace externo
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkType, setLinkType] = useState<FileType>('video');
  const [isSavingLink, setIsSavingLink] = useState(false);

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

  // Cargar archivos del módulo en tiempo real desde Firestore
  useEffect(() => {
    const q = query(
      collection(db, 'modules', module.id, 'files'),
      orderBy('uploadedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const filesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ModuleFile[];
      setFiles(filesList);
      setLoadingFiles(false);
    }, (error) => {
      console.error("Error fetching files from Firestore:", error);
      setLoadingFiles(false);
    });

    return () => unsubscribe();
  }, [module.id]);

  const getFileType = (fileName: string): FileType => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext || '')) return 'video';
    if (['ppt', 'pptx', 'key', 'odp'].includes(ext || '')) return 'presentation';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
    return 'other';
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Convertir archivo a Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Quitar el prefijo data:...;base64, para almacenar solo el payload base64 limpio
        const base64Clean = result.split(',')[1] || result;
        resolve(base64Clean);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Manejar Subida de Archivo
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadProgress(10);
      
      const user = auth.currentUser;
      if (!user) {
        alert("Debes iniciar sesión con Google para subir archivos.");
        throw new Error("Debes iniciar sesión.");
      }

      if (!isTeacher) {
        alert("Solo los docentes autorizados pueden subir materiales.");
        throw new Error("Permisos insuficientes.");
      }

      console.log("Procesando archivo para almacenamiento en Firestore:", file.name, file.size);
      
      // 1. Convertir a Base64
      setUploadProgress(25);
      const base64Data = await fileToBase64(file);
      
      // 2. Crear documento de archivo
      const fileRef = doc(collection(db, 'modules', module.id, 'files'));
      const fileId = fileRef.id;

      // 3. Dividir en chunks seguros para Firestore (500KB por chunk)
      const CHUNK_SIZE = 500 * 1024;
      const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);

      console.log(`Guardando en Firestore en ${totalChunks} partes...`);

      for (let i = 0; i < totalChunks; i++) {
        const chunkSlice = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const chunkDocRef = doc(db, 'modules', module.id, 'files', fileId, 'chunks', i.toString());
        await setDoc(chunkDocRef, {
          index: i,
          data: chunkSlice
        });
        const currentProgress = 30 + Math.round(((i + 1) / totalChunks) * 60);
        setUploadProgress(currentProgress);
      }

      // 4. Guardar metadatos finales en el documento principal
      const fileData: Omit<ModuleFile, 'id'> = {
        moduleId: module.id,
        name: file.name,
        url: '',
        type: getFileType(file.name),
        mimeType: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
        size: file.size,
        isChunked: true,
        totalChunks: totalChunks,
        uploadedAt: new Date().toISOString()
      };

      await setDoc(fileRef, fileData);
      setUploadProgress(100);
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      console.error("Error al subir archivo:", error);
      handleFirestoreError(error, OperationType.WRITE, `modules/${module.id}/files`);
      alert(error?.message || "No se pudo guardar el archivo. Por favor, intenta de nuevo.");
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  // Guardar Enlace Web Externo (Drive, YouTube, etc.)
  const handleSaveExternalLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkName.trim() || !linkUrl.trim()) return;

    let validUrl = linkUrl.trim();
    if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
      validUrl = 'https://' + validUrl;
    }

    try {
      setIsSavingLink(true);
      const fileRef = doc(collection(db, 'modules', module.id, 'files'));
      const fileData: Omit<ModuleFile, 'id'> = {
        moduleId: module.id,
        name: linkName.trim(),
        url: validUrl,
        type: linkType,
        isExternalLink: true,
        uploadedAt: new Date().toISOString()
      };

      await setDoc(fileRef, fileData);
      setIsLinkModalOpen(false);
      setLinkName('');
      setLinkUrl('');
    } catch (error: any) {
      console.error("Error al guardar enlace:", error);
      alert("Error al guardar el enlace.");
    } finally {
      setIsSavingLink(false);
    }
  };

  // Abrir o Descargar Archivo
  const handleOpenFile = async (file: ModuleFile) => {
    // Si es un enlace web externo o URL estándar
    if (file.url && (file.url.startsWith('http://') || file.url.startsWith('https://'))) {
      window.open(file.url, '_blank', 'noopener,noreferrer');
      return;
    }

    // Si es un archivo almacenado en chunks en Firestore
    try {
      setOpeningFileId(file.id);
      
      const chunksSnap = await getDocs(
        query(collection(db, 'modules', module.id, 'files', file.id, 'chunks'), orderBy('index', 'asc'))
      );

      if (chunksSnap.empty) {
        alert("No se encontró el contenido del archivo.");
        setOpeningFileId(null);
        return;
      }

      const chunks = chunksSnap.docs.map(d => d.data().data as string);
      const fullBase64 = chunks.join('');

      // Convertir Base64 a Blob
      const byteCharacters = atob(fullBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const mimeType = file.mimeType || (file.name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
      const blob = new Blob([byteArray], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);

      // Abrir en nueva pestaña
      const newWindow = window.open(blobUrl, '_blank');
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        // Si el navegador bloqueó la ventana emergente, forzar descarga con enlace
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Error al abrir archivo:", error);
      alert("No se pudo cargar el archivo. Por favor, intenta de nuevo.");
    } finally {
      setOpeningFileId(null);
    }
  };

  // Eliminar Archivo
  const handleDeleteFile = async () => {
    if (!fileToDelete) return;
    
    if (!isTeacher) {
      alert("No tienes permisos para realizar esta acción.");
      setFileToDelete(null);
      return;
    }

    try {
      setIsDeleting(true);
      
      // 1. Eliminar chunks si existen
      try {
        const chunksSnap = await getDocs(collection(db, 'modules', module.id, 'files', fileToDelete.id, 'chunks'));
        for (const cDoc of chunksSnap.docs) {
          await deleteDoc(cDoc.ref);
        }
      } catch (err) {
        console.warn("Error borrando chunks:", err);
      }

      // 2. Eliminar documento principal
      await deleteDoc(doc(db, 'modules', module.id, 'files', fileToDelete.id));
      
      setFileToDelete(null);
    } catch (error: any) {
      console.error("[DELETE] Error al eliminar archivo:", error);
      handleFirestoreError(error, OperationType.DELETE, `modules/${module.id}/files/${fileToDelete.id}`);
      alert("No se pudo eliminar el archivo. Verifica tus permisos.");
    } finally {
      setIsDeleting(false);
    }
  };

  const getIcon = (type: FileType) => {
    switch (type) {
      case 'pdf': return FileText;
      case 'video': return Video;
      case 'presentation': return FileText;
      case 'image': return Image;
      default: return FileText;
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-16">
      {/* Botón Volver */}
      <button 
        onClick={onBack}
        className="flex items-center text-sm font-bold text-gray-500 hover:text-[#000033] mb-8 transition-colors group cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
        Volver a todos los módulos
      </button>

      {/* Tarjeta Principal del Módulo */}
      <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-50 rounded-full blur-3xl -z-10 opacity-60"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-gray-100">
          <div>
            <span className="text-xs font-black tracking-widest text-[#e31b23] uppercase">
              Módulo {module.order}
            </span>
            <h1 className="text-3xl font-black text-[#000033] mt-1">
              {module.title}
            </h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-2.5">
            {onToggleComplete && (currentUser && (isAuthorizedStudent || isTeacher)) && (
              <button
                onClick={onToggleComplete}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer ${
                  isCompleted 
                    ? 'bg-emerald-500 text-white shadow-xs' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>{isCompleted ? 'Módulo Completado' : 'Marcar Completado'}</span>
              </button>
            )}

            <span className="inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-black bg-gray-100 text-gray-700">
              {files.length} {files.length === 1 ? 'Material disponible' : 'Materiales disponibles'}
            </span>
          </div>
        </div>

        {/* Lista de Archivos y Materiales */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-black text-[#000033]">
              Material de Estudio y Recursos
            </h3>
            {isTeacher && (
              <button
                onClick={() => setIsLinkModalOpen(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-[#000033] hover:text-[#e31b23] bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir Enlace Web</span>
              </button>
            )}
          </div>

          <div className="space-y-4">
            {loadingFiles ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-[#e31b23] animate-spin mb-2" />
                <p className="text-xs text-gray-500 font-bold">Cargando materiales...</p>
              </div>
            ) : !currentUser ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 max-w-md mx-auto">
                <div className="p-5 bg-blue-50 rounded-2xl">
                  <LogIn className="w-10 h-10 text-[#000033]" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-gray-900">Inicia sesión para ver el contenido</h4>
                  <p className="text-gray-500 text-sm mt-1">
                    Debes identificarte con tu cuenta de Google institucional o autorizada para acceder a las guías y materiales.
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
              <div className="grid grid-cols-1 gap-3">
                {files.map((file) => {
                  const Icon = getIcon(file.type);
                  const isOpening = openingFileId === file.id;

                  return (
                    <motion.div 
                      key={file.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-200/90 shadow-2xs hover:border-[#000033]/40 hover:shadow-md transition-all"
                    >
                      <div 
                        onClick={() => handleOpenFile(file)}
                        className="flex items-center min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-[#e31b23]/10 transition-colors">
                          <Icon className="w-6 h-6 text-[#000033] group-hover:text-[#e31b23]" />
                        </div>
                        <div className="ml-4 truncate">
                          <p className="font-bold text-gray-900 group-hover:text-[#e31b23] transition-colors truncate text-sm">
                            {file.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-gray-400 font-medium">
                              {new Date(file.uploadedAt).toLocaleDateString()}
                            </span>
                            {file.size ? (
                              <span className="text-[11px] text-gray-400 font-semibold">
                                • {formatFileSize(file.size)}
                              </span>
                            ) : null}
                            {file.isExternalLink && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded font-bold">
                                Enlace Web
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-1 ml-4">
                        <button
                          onClick={() => handleOpenFile(file)}
                          disabled={isOpening}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#000033] bg-gray-50 hover:bg-[#000033] hover:text-white rounded-xl transition-all cursor-pointer disabled:opacity-50"
                          title="Abrir o Descargar archivo"
                        >
                          {isOpening ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-[#e31b23]" />
                              <span>Abriendo...</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-4 h-4" />
                              <span>Ver / Descargar</span>
                            </>
                          )}
                        </button>

                        {isTeacher && (
                          <button 
                            onClick={() => setFileToDelete(file)}
                            className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                            title="Eliminar material"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                <div className="p-6 bg-gray-50 rounded-full">
                  <AlertCircle className="w-12 h-12 text-gray-300" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-gray-800">No hay archivos disponibles</h4>
                  <p className="text-gray-500 max-w-md mx-auto mt-2 text-sm">
                    Los docentes subirán el material de este módulo próximamente. 
                    Aquí podrás encontrar PDFs, presentaciones y videos del curso.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Zona Docente (Subida de Materiales) */}
          <div className="mt-12 pt-10 border-t border-gray-100">
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
                <p className="text-blue-800 font-bold">Modo Alumno / Participante</p>
                <p className="text-sm text-blue-600 text-center mt-1">
                  Hola <span className="font-bold">{currentUser.displayName || currentUser.email}</span>. 
                  Tienes acceso para ver y descargar todo el material educativo.
                </p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-gray-50/80 rounded-2xl border-2 border-dashed border-gray-300">
                <div className="flex items-center">
                  <div className="p-3 bg-red-100/60 rounded-xl mr-4">
                    <Upload className="w-6 h-6 text-[#e31b23]" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-gray-900 text-sm">Zona de Publicación Docente</p>
                    <p className="text-xs text-gray-500">Sesión activa: <span className="text-[#e31b23] font-bold">{currentUser.email}</span></p>
                  </div>
                </div>
                
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  accept=".pdf,.ppt,.pptx,.key,.doc,.docx,.xls,.xlsx,.mp4,.mov,.avi,.jpg,.jpeg,.png,.webp"
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsLinkModalOpen(true)}
                    className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-all text-xs cursor-pointer shadow-2xs"
                  >
                    <LinkIcon className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                    <span>Enlace Web</span>
                  </button>

                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center px-5 py-2 bg-[#000033] text-white rounded-xl font-bold hover:bg-[#000044] disabled:opacity-50 transition-all text-xs min-w-[150px] justify-center cursor-pointer shadow-xs"
                  >
                    {isUploading ? (
                      <div className="flex items-center">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin text-[#e31b23]" />
                        <span>{uploadProgress >= 90 ? "Guardando..." : `${uploadProgress}%`}</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 mr-1.5 text-[#e31b23]" />
                        <span>Subir Archivo</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal para Agregar Enlace Web (Drive, YouTube, etc.) */}
      <AnimatePresence>
        {isLinkModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100"
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-xl">
                    <LinkIcon className="w-5 h-5 text-[#000033]" />
                  </div>
                  <h3 className="text-lg font-black text-[#000033]">Añadir Enlace Externo</h3>
                </div>
                <button
                  onClick={() => setIsLinkModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveExternalLink} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Título o Nombre del Recurso *
                  </label>
                  <input
                    type="text"
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    placeholder="Ej: Grabación de la Clase en YouTube / Carpeta Drive"
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000033] outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    URL / Enlace *
                  </label>
                  <input
                    type="text"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://drive.google.com/... o https://youtube.com/..."
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000033] outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Tipo de Contenido
                  </label>
                  <select
                    value={linkType}
                    onChange={(e) => setLinkType(e.target.value as FileType)}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000033] outline-none bg-white"
                  >
                    <option value="video">Video (YouTube, Drive, Vimeo)</option>
                    <option value="pdf">Documento PDF / Carpeta de Archivos</option>
                    <option value="presentation">Presentación / Diapositivas</option>
                    <option value="other">Otro Recurso Web</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsLinkModalOpen(false)}
                    className="px-4 py-2 border border-gray-200 text-gray-600 font-bold rounded-xl text-xs hover:bg-gray-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingLink}
                    className="px-5 py-2 bg-[#000033] text-white font-bold rounded-xl text-xs hover:bg-[#000044] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isSavingLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>Guardar Enlace</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmación de Eliminación */}
      <AnimatePresence>
        {fileToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
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
                <p className="text-gray-500 font-medium mb-8 text-sm">
                  ¿Estás seguro de que deseas eliminar <span className="text-gray-900 font-bold">"{fileToDelete.name}"</span>? Esta acción no se puede deshacer.
                </p>
                
                <div className="flex gap-3 w-full">
                  <button 
                    onClick={() => setFileToDelete(null)}
                    disabled={isDeleting}
                    className="flex-1 px-6 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-all disabled:opacity-50 text-sm cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleDeleteFile}
                    disabled={isDeleting}
                    className="flex-1 px-6 py-3 rounded-xl bg-[#e31b23] text-white font-bold hover:bg-[#c4171e] transition-all shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center text-sm cursor-pointer"
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
