
import { motion } from 'motion/react';
import { ChevronLeft, Send, User, MessageCircle, Info, Clock, Loader2, LogIn } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ForumPost } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, addDoc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

interface ForumProps {
  onBack: () => void;
}

export default function Forum({ onBack }: ForumProps) {
  const [comment, setComment] = useState('');
  const [author, setAuthor] = useState('');
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user?.displayName) setAuthor(user.displayName);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const forumPath = 'forum';
    const q = query(
      collection(db, forumPath),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q, 
      (snapshot) => {
        const postsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ForumPost[];
        setPosts(postsData);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        console.error("Error en tiempo real del foro:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const handleSend = async () => {
    if (!comment.trim() || !author.trim() || isSending) return;

    const forumPath = 'forum';
    try {
      setIsSending(true);
      const newPost: Omit<ForumPost, 'id'> = {
        author: author.trim(),
        content: comment.trim(),
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, forumPath), newPost);
      setComment('');
    } catch (error) {
      console.error("Error al enviar consulta:", error);
      handleFirestoreError(error, OperationType.CREATE, forumPath);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={onBack}
        className="flex items-center text-[#000033] font-semibold mb-8 hover:underline"
      >
        <ChevronLeft className="w-5 h-5 mr-1" />
        Volver al Inicio
      </motion.button>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 mb-8">
        <div className="bg-[#e31b23] p-8 text-white">
          <div className="flex items-center mb-1">
            <MessageCircle className="w-5 h-5 mr-2" />
            <span className="text-sm font-medium text-white/80 uppercase tracking-wider">Comunidad</span>
          </div>
          <h2 className="text-3xl font-bold">Foro de Consultas</h2>
          <p className="mt-2 text-white/80">Espacio para dudas, preguntas y colaboración entre alumnos y docentes.</p>
        </div>

        <div className="p-8">
          <div className="flex items-start space-x-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-gray-400" />
            </div>
            <div className="flex-1 space-y-4">
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Tu nombre"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#000033] focus:border-transparent outline-none transition-all"
              />
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Escribe tu consulta aquí..."
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#000033] focus:border-transparent outline-none min-h-[120px] transition-all"
              />
              <div className="mt-4 flex justify-end">
                <button 
                  onClick={handleSend}
                  className="flex items-center px-6 py-3 bg-[#000033] text-white rounded-xl font-bold hover:bg-[#000044] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!comment.trim() || !author.trim() || isSending}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Enviar Consulta
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#e31b23] animate-spin" />
            <p className="mt-4 text-gray-500 font-medium">Cargando consultas...</p>
          </div>
        ) : !currentUser ? (
          <div className="bg-amber-50 border border-amber-100 rounded-3xl p-12 text-center flex flex-col items-center">
            <div className="p-4 bg-white rounded-2xl shadow-sm mb-4">
              <LogIn className="w-10 h-10 text-amber-500" />
            </div>
            <h4 className="text-xl font-bold text-amber-900">Acceso Requerido</h4>
            <p className="text-amber-700 mt-2 max-w-md">
              Debes iniciar sesión con tu cuenta de Google para participar en el foro y ver las consultas de la comunidad.
            </p>
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex items-start">
            <Info className="w-6 h-6 text-[#000033] mr-4 mt-1" />
            <div>
              <h4 className="font-bold text-[#000033]">Sin consultas todavía</h4>
              <p className="text-sm text-gray-600 mt-1">
                ¡Sé el primero en preguntar! Los docentes responderán a la brevedad.
              </p>
            </div>
          </div>
        ) : (
          posts.map((post) => (
            <motion.div 
              key={post.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mr-3">
                    <User className="w-4 h-4 text-gray-500" />
                  </div>
                  <span className="font-bold text-gray-800">{post.author}</span>
                </div>
                <div className="flex items-center text-xs text-gray-400">
                  <Clock className="w-3 h-3 mr-1" />
                  {new Date(post.createdAt).toLocaleDateString()}
                </div>
              </div>
              <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{post.content}</p>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
