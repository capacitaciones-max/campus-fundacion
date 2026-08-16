
import { motion } from 'motion/react';
import { BookOpen, Settings, Ruler, Scissors, Cpu, Zap, Package, ShieldCheck, Paintbrush, CheckCircle, MessageSquare } from 'lucide-react';
import { LearningModule } from '../types';
import { MODULES } from '../data';

const ICONS = [
  BookOpen, Settings, Ruler, Scissors, Cpu, Zap, Package, ShieldCheck, Paintbrush, CheckCircle
];

interface ModuleGridProps {
  onSelectModule: (module: LearningModule) => void;
  onOpenForum: () => void;
  completedModules: string[];
}

export default function ModuleGrid({ onSelectModule, onOpenForum, completedModules }: ModuleGridProps) {
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {MODULES.map((module, index) => {
          const Icon = ICONS[index];
          const isCompleted = completedModules.includes(module.id);
          
          return (
            <motion.button
              key={module.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectModule(module)}
              className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl shadow-md border border-gray-100 hover:border-[#000033] hover:shadow-xl transition-all group relative overflow-hidden"
            >
              <div className={`absolute top-0 left-0 w-1 h-full transition-opacity ${isCompleted ? 'bg-green-500 opacity-100' : 'bg-[#e31b23] opacity-0 group-hover:opacity-100'}`} />
              
              {isCompleted && (
                <div className="absolute top-4 right-4">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
              )}

              <div className={`p-4 rounded-full mb-4 transition-colors ${isCompleted ? 'bg-green-50 bg-opacity-50' : 'bg-gray-50 group-hover:bg-[#000033]'}`}>
                <Icon className={`w-8 h-8 transition-colors ${isCompleted ? 'text-green-600' : 'text-[#000033] group-hover:text-white'}`} />
              </div>
              <span className="text-sm font-semibold text-gray-400 mb-1">Módulo {module.order}</span>
              <h3 className="text-center font-bold text-gray-800 leading-snug group-hover:text-[#000033]">
                {module.title}
              </h3>
            </motion.button>
          );
        })}
        
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          onClick={onOpenForum}
          className="flex flex-col items-center justify-center p-8 bg-[#000033] rounded-2xl shadow-lg border border-transparent hover:bg-[#000044] transition-all col-span-1 sm:col-span-2 lg:col-span-1"
        >
          <div className="p-4 bg-white/10 rounded-full mb-4">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <span className="text-sm font-semibold text-white/60 mb-1">Interacción</span>
          <h3 className="text-center font-bold text-white leading-snug">
            Foro de Consultas
          </h3>
        </motion.button>
      </div>
    </div>
  );
}
