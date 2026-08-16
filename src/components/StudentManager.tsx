import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  UserPlus, 
  Trash2, 
  Mail, 
  Loader2, 
  UserCheck, 
  GraduationCap, 
  ShieldCheck, 
  Crown, 
  Search,
  CheckCircle2,
  AlertCircle,
  User as UserIcon,
  Sparkles
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError, PRIMARY_ADMIN_EMAILS, isPrimaryAdmin } from '../lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { Student, Teacher } from '../types';

interface StudentManagerProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'students' | 'teachers';
}

export default function StudentManager({ isOpen, onClose, initialTab = 'students' }: StudentManagerProps) {
  const [activeTab, setActiveTab] = useState<'students' | 'teachers'>(initialTab);
  
  // Estados para alumnos
  const [students, setStudents] = useState<Student[]>([]);
  const [studentEmail, setStudentEmail] = useState('');
  const [studentName, setStudentName] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  // Estados para docentes
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [isAddingTeacher, setIsAddingTeacher] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState('');

  // Notificaciones y estado de permiso
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (!isOpen) {
      setFeedback(null);
      return;
    }

    // Verificar si el usuario actual es un Administrador
    const verifyUser = () => {
      const user = auth.currentUser;
      if (!user) {
        setIsAuthorized(false);
        alert("Debes iniciar sesión para acceder a la administración.");
        onClose();
        return;
      }

      const hasAdminAccess = isPrimaryAdmin(user.email);
      if (!hasAdminAccess) {
        setIsAuthorized(false);
        alert("Acceso denegado: Solo los administradores pueden gestionar alumnos y docentes.");
        onClose();
        return;
      }

      setIsAuthorized(true);
    };

    verifyUser();

    // Suscripción en tiempo real a la lista de alumnos
    const qStudents = query(collection(db, 'students'));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        email: d.id,
        ...d.data()
      })) as Student[];
      setStudents(list);
      setLoadingStudents(false);
    }, (error) => {
      console.error("Error fetching students:", error);
      setLoadingStudents(false);
    });

    // Suscripción en tiempo real a la lista de docentes
    const qTeachers = query(collection(db, 'teachers'));
    const unsubTeachers = onSnapshot(qTeachers, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        email: d.id,
        ...d.data()
      })) as Teacher[];
      setTeachers(list);
      setLoadingTeachers(false);
    }, (error) => {
      console.error("Error fetching teachers:", error);
      setLoadingTeachers(false);
    });

    return () => {
      unsubStudents();
      unsubTeachers();
    };
  }, [isOpen, onClose]);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  // Agregar Alumno
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentEmail.trim() || !auth.currentUser) return;

    const email = studentEmail.trim().toLowerCase();

    // Validar formato de email
    if (!email.includes('@') || !email.includes('.')) {
      showNotification('Por favor, ingresa un correo electrónico válido.', 'error');
      return;
    }

    try {
      setIsAddingStudent(true);
      await setDoc(doc(db, 'students', email), {
        email,
        name: studentName.trim() || null,
        addedAt: serverTimestamp(),
        addedBy: auth.currentUser.email
      });

      setStudentEmail('');
      setStudentName('');
      showNotification(`Alumno ${email} añadido correctamente.`);
    } catch (error) {
      console.error("Error al añadir alumno:", error);
      handleFirestoreError(error, OperationType.WRITE, `students/${email}`);
      showNotification('No se pudo añadir al alumno. Verifica tus permisos.', 'error');
    } finally {
      setIsAddingStudent(false);
    }
  };

  // Eliminar Alumno
  const handleDeleteStudent = async (email: string) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el acceso al alumno ${email}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'students', email.toLowerCase()));
      showNotification(`Alumno ${email} eliminado.`);
    } catch (error) {
      console.error("Error al eliminar alumno:", error);
      handleFirestoreError(error, OperationType.DELETE, `students/${email}`);
      showNotification('Error al eliminar alumno.', 'error');
    }
  };

  // Agregar Docente
  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherEmail.trim() || !auth.currentUser) return;

    const email = teacherEmail.trim().toLowerCase();

    // Validar formato de email
    if (!email.includes('@') || !email.includes('.')) {
      showNotification('Por favor, ingresa un correo electrónico válido.', 'error');
      return;
    }

    if (PRIMARY_ADMIN_EMAILS.includes(email)) {
      showNotification('Este correo ya es un Administrador Principal predeterminado.', 'error');
      return;
    }

    try {
      setIsAddingTeacher(true);
      await setDoc(doc(db, 'teachers', email), {
        email,
        name: teacherName.trim() || null,
        addedAt: serverTimestamp(),
        addedBy: auth.currentUser.email
      });

      setTeacherEmail('');
      setTeacherName('');
      showNotification(`Docente ${email} añadido con permisos de administración.`);
    } catch (error) {
      console.error("Error al añadir docente:", error);
      handleFirestoreError(error, OperationType.WRITE, `teachers/${email}`);
      showNotification('No se pudo añadir al docente. Verifica tus permisos.', 'error');
    } finally {
      setIsAddingTeacher(false);
    }
  };

  // Eliminar Docente
  const handleDeleteTeacher = async (email: string) => {
    const emailLower = email.toLowerCase();
    
    if (PRIMARY_ADMIN_EMAILS.includes(emailLower)) {
      alert("No se pueden eliminar los administradores principales del sistema.");
      return;
    }

    if (!window.confirm(`¿Estás seguro de que deseas revocar los permisos de docente a ${email}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'teachers', emailLower));
      showNotification(`Permisos de docente revocados para ${email}.`);
    } catch (error) {
      console.error("Error al eliminar docente:", error);
      handleFirestoreError(error, OperationType.DELETE, `teachers/${emailLower}`);
      showNotification('Error al revocar permisos de docente.', 'error');
    }
  };

  // Filtrado de alumnos
  const filteredStudents = students.filter(s => 
    s.email.toLowerCase().includes(studentSearch.toLowerCase()) ||
    (s.name && s.name.toLowerCase().includes(studentSearch.toLowerCase()))
  );

  // Lista combinada de docentes (Administradores principales + Docentes registrados)
  const allTeachersList: Teacher[] = [
    ...PRIMARY_ADMIN_EMAILS.map(email => ({
      email,
      name: email === 'sole.petetta@gmail.com' ? 'Soledad Petetta' : 'Capacitaciones Fundación Crucianelli',
      isPrimaryAdmin: true
    })),
    ...teachers.filter(t => !PRIMARY_ADMIN_EMAILS.includes(t.email.toLowerCase()))
  ];

  const filteredTeachers = allTeachersList.filter(t => 
    t.email.toLowerCase().includes(teacherSearch.toLowerCase()) ||
    (t.name && t.name.toLowerCase().includes(teacherSearch.toLowerCase()))
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-gray-100"
        >
          {/* Header del Modal */}
          <div className="bg-[#000033] p-6 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/10 rounded-xl">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight text-white">
                  Panel de Administración
                </h2>
                <p className="text-xs text-gray-300 font-medium">
                  Gestión de accesos para Alumnos y Docentes
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-300 hover:text-white"
              title="Cerrar panel"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Navegación por pestañas */}
          <div className="flex border-b border-gray-200 bg-gray-50/80 px-6 pt-3 gap-2">
            <button
              onClick={() => setActiveTab('students')}
              className={`flex items-center gap-2 py-3 px-4 font-bold text-sm border-b-2 transition-all cursor-pointer ${
                activeTab === 'students'
                  ? 'border-[#e31b23] text-[#000033] bg-white rounded-t-xl shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/60 rounded-t-xl'
              }`}
            >
              <GraduationCap className={`w-4 h-4 ${activeTab === 'students' ? 'text-[#e31b23]' : 'text-gray-400'}`} />
              <span>Alumnos</span>
              <span className={`px-2 py-0.5 text-xs rounded-full font-extrabold ${
                activeTab === 'students' ? 'bg-red-100 text-[#e31b23]' : 'bg-gray-200 text-gray-600'
              }`}>
                {students.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('teachers')}
              className={`flex items-center gap-2 py-3 px-4 font-bold text-sm border-b-2 transition-all cursor-pointer ${
                activeTab === 'teachers'
                  ? 'border-[#e31b23] text-[#000033] bg-white rounded-t-xl shadow-xs'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/60 rounded-t-xl'
              }`}
            >
              <ShieldCheck className={`w-4 h-4 ${activeTab === 'teachers' ? 'text-[#e31b23]' : 'text-gray-400'}`} />
              <span>Docentes y Admins</span>
              <span className={`px-2 py-0.5 text-xs rounded-full font-extrabold ${
                activeTab === 'teachers' ? 'bg-red-100 text-[#e31b23]' : 'bg-gray-200 text-gray-600'
              }`}>
                {allTeachersList.length}
              </span>
            </button>
          </div>

          {/* Notificación Feedback */}
          {feedback && (
            <div className={`mx-6 mt-4 p-3.5 rounded-xl flex items-center gap-3 text-sm font-medium ${
              feedback.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Contenido según pestaña activa */}
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            
            {/* === PESTAÑA: ALUMNOS === */}
            {activeTab === 'students' && (
              <div className="space-y-6">
                {/* Formulario para añadir alumno */}
                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200/80">
                  <h3 className="text-sm font-black text-[#000033] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-[#e31b23]" />
                    Registrar nuevo alumno
                  </h3>
                  <form onSubmit={handleAddStudent} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="email"
                          value={studentEmail}
                          onChange={(e) => setStudentEmail(e.target.value)}
                          placeholder="Email del alumno *"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e31b23] focus:border-transparent outline-none transition-all text-sm"
                          required
                        />
                      </div>
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={studentName}
                          onChange={(e) => setStudentName(e.target.value)}
                          placeholder="Nombre y Apellido (Opcional)"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e31b23] focus:border-transparent outline-none transition-all text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isAddingStudent}
                        className="bg-[#e31b23] text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-[#c4171e] transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm"
                      >
                        {isAddingStudent ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                        {isAddingStudent ? 'Guardando...' : 'Añadir Alumno'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Buscador y Lista de Alumnos */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-black text-[#000033] uppercase tracking-wider flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-gray-500" />
                      Alumnos Registrados ({students.length})
                    </h3>

                    <div className="relative w-48 sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Buscar alumno..."
                        className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:bg-white focus:ring-1 focus:ring-[#000033] outline-none"
                      />
                    </div>
                  </div>

                  {loadingStudents ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="w-8 h-8 text-[#e31b23] animate-spin" />
                    </div>
                  ) : filteredStudents.length > 0 ? (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {filteredStudents.map((student) => (
                        <div 
                          key={student.email}
                          className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-xs transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-red-50 text-[#e31b23] flex items-center justify-center font-bold text-xs">
                              {student.name ? student.name.charAt(0).toUpperCase() : student.email.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              {student.name && (
                                <p className="text-sm font-bold text-gray-900">{student.name}</p>
                              )}
                              <p className="text-xs font-medium text-gray-600">{student.email}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteStudent(student.email)}
                            className="p-2 text-gray-400 hover:text-[#e31b23] hover:bg-red-50 rounded-lg transition-all opacity-70 group-hover:opacity-100 cursor-pointer"
                            title="Eliminar alumno"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm font-semibold">
                        {studentSearch ? 'No se encontraron alumnos con ese criterio.' : 'No hay alumnos registrados aún.'}
                      </p>
                      <p className="text-gray-400 text-xs mt-1">
                        Utiliza el formulario superior para habilitar el acceso a los estudiantes.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* === PESTAÑA: DOCENTES === */}
            {activeTab === 'teachers' && (
              <div className="space-y-6">
                {/* Banner explicativo */}
                <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-100 flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-[#000033] flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-[#000033] space-y-1">
                    <p className="font-bold">Privilegios de Docentes y Administradores:</p>
                    <p className="text-gray-600">
                      Los docentes pueden subir, editar y eliminar material de estudio en todos los módulos, moderar el foro y gestionar los alumnos y docentes autorizados.
                    </p>
                  </div>
                </div>

                {/* Formulario para añadir docente */}
                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200/80">
                  <h3 className="text-sm font-black text-[#000033] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#e31b23]" />
                    Designar nuevo docente / instructor
                  </h3>
                  <form onSubmit={handleAddTeacher} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="email"
                          value={teacherEmail}
                          onChange={(e) => setTeacherEmail(e.target.value)}
                          placeholder="Email del docente *"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e31b23] focus:border-transparent outline-none transition-all text-sm"
                          required
                        />
                      </div>
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={teacherName}
                          onChange={(e) => setTeacherName(e.target.value)}
                          placeholder="Nombre y Cargo (Opcional)"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#e31b23] focus:border-transparent outline-none transition-all text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isAddingTeacher}
                        className="bg-[#000033] text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-[#000044] transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-sm"
                      >
                        {isAddingTeacher ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        {isAddingTeacher ? 'Asignando...' : 'Asignar como Docente'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Buscador y Lista de Docentes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-black text-[#000033] uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-gray-500" />
                      Equipo Docente y Administradores ({allTeachersList.length})
                    </h3>

                    <div className="relative w-48 sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={teacherSearch}
                        onChange={(e) => setTeacherSearch(e.target.value)}
                        placeholder="Buscar docente..."
                        className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:bg-white focus:ring-1 focus:ring-[#000033] outline-none"
                      />
                    </div>
                  </div>

                  {loadingTeachers ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="w-8 h-8 text-[#000033] animate-spin" />
                    </div>
                  ) : filteredTeachers.length > 0 ? (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {filteredTeachers.map((teacher) => {
                        const isPrimary = !!teacher.isPrimaryAdmin;
                        return (
                          <div 
                            key={teacher.email}
                            className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                              isPrimary 
                                ? 'bg-amber-50/40 border-amber-200/80 shadow-2xs' 
                                : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-xs group'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                isPrimary 
                                  ? 'bg-amber-100 text-amber-900' 
                                  : 'bg-blue-50 text-[#000033]'
                              }`}>
                                {isPrimary ? <Crown className="w-4 h-4 text-amber-700" /> : <ShieldCheck className="w-4 h-4 text-[#000033]" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  {teacher.name && (
                                    <p className="text-sm font-bold text-gray-900">{teacher.name}</p>
                                  )}
                                  {isPrimary ? (
                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-black uppercase tracking-wider">
                                      Admin Principal
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-blue-100 text-[#000033] rounded-md text-[10px] font-black uppercase tracking-wider">
                                      Docente
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-medium text-gray-600">{teacher.email}</p>
                              </div>
                            </div>

                            <div>
                              {isPrimary ? (
                                <span className="text-[11px] font-bold text-amber-700/80 px-2 py-1 bg-amber-50 rounded-lg">
                                  Protegido
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleDeleteTeacher(teacher.email)}
                                  className="p-2 text-gray-400 hover:text-[#e31b23] hover:bg-red-50 rounded-lg transition-all opacity-70 group-hover:opacity-100 cursor-pointer"
                                  title="Revocar permisos de docente"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <ShieldCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm font-semibold">
                        {teacherSearch ? 'No se encontraron docentes con ese criterio.' : 'No hay docentes adicionales registrados.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Footer del Modal */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
              Fundación Nazareno Crucianelli • Plataforma de Capacitación
            </p>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 rounded-lg transition-all cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
