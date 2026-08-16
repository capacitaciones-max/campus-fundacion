
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Header from './components/Header';
import ModuleGrid from './components/ModuleGrid';
import ModuleDetails from './components/ModuleDetails';
import Forum from './components/Forum';
import { LearningModule } from './types';
import { MODULES } from './data';
import { useProgress } from './hooks/useProgress';

type ViewState = 'grid' | 'details' | 'forum';

export default function App() {
  const { 
    completedModules, 
    toggleComplete, 
    currentView, 
    setView, 
    selectedModuleId, 
    setModuleId,
    loading 
  } = useProgress();

  const handleSelectModule = (module: LearningModule) => {
    setModuleId(module.id);
    setView('details');
    window.scrollTo(0, 0);
  };

  const handleOpenForum = () => {
    setView('forum');
    window.scrollTo(0, 0);
  };

  const handleBack = () => {
    setView('grid');
    setModuleId(null);
    window.scrollTo(0, 0);
  };

  const selectedModule = MODULES.find(m => m.id === selectedModuleId) || null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#e31b23] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 selection:bg-[#e31b23] selection:text-white flex flex-col">
      <Header />
      
      <main className="pb-20 flex-1">
        <AnimatePresence mode="wait">
          {currentView === 'grid' && (
            <motion.div
              key="grid"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 text-center">
                <h2 className="text-3xl sm:text-4xl font-black text-[#000033] tracking-tight">
                  Curso Introductorio a los Procesos Industriales Primarios
                </h2>
                <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto font-medium">
                  Selecciona un módulo para acceder al material de estudio o participa en el foro de consultas.
                </p>
              </div>
              <ModuleGrid 
                onSelectModule={handleSelectModule} 
                onOpenForum={handleOpenForum} 
                completedModules={completedModules}
              />
            </motion.div>
          )}

          {currentView === 'details' && selectedModule && (
            <motion.div
              key="details"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <ModuleDetails 
                module={selectedModule} 
                onBack={handleBack} 
                isCompleted={completedModules.includes(selectedModule.id)}
                onToggleComplete={() => toggleComplete(selectedModule.id)}
              />
            </motion.div>
          )}

          {currentView === 'forum' && (
            <motion.div
              key="forum"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <Forum onBack={handleBack} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="bg-white border-t border-gray-200 py-10">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-gray-400 text-sm font-medium">
            © {new Date().getFullYear()} Fundación Nazareno Crucianelli. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}


