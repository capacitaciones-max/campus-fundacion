
import { useState, useEffect } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export interface ProgressData {
  userId: string;
  completedModules: string[];
  currentView?: string;
  selectedModuleId?: string | null;
  lastUpdated: any;
}

export function useProgress() {
  const [completedModules, setCompletedModules] = useState<string[]>([]);
  const [currentView, setCurrentView] = useState<string>('grid');
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        setUserId(null);
        setCompletedModules([]);
        setCurrentView('grid');
        setSelectedModuleId(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!userId) return;

    const docRef = doc(db, 'progress', userId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as ProgressData;
        setCompletedModules(data.completedModules || []);
        if (data.currentView) setCurrentView(data.currentView);
        if (data.selectedModuleId !== undefined) setSelectedModuleId(data.selectedModuleId);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching progress:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const updateProgress = async (updates: Partial<ProgressData>) => {
    if (!userId) return;

    try {
      await setDoc(doc(db, 'progress', userId), {
        ...updates,
        userId,
        lastUpdated: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `progress/${userId}`);
    }
  };

  const toggleComplete = async (moduleId: string) => {
    const newCompleted = completedModules.includes(moduleId)
      ? completedModules.filter(id => id !== moduleId)
      : [...completedModules, moduleId];
    
    setCompletedModules(newCompleted);
    await updateProgress({ completedModules: newCompleted });
  };

  const setView = async (view: string) => {
    setCurrentView(view);
    await updateProgress({ currentView: view });
  };

  const setModuleId = async (id: string | null) => {
    setSelectedModuleId(id);
    await updateProgress({ selectedModuleId: id });
  };

  return { 
    completedModules, 
    toggleComplete, 
    currentView, 
    setView, 
    selectedModuleId, 
    setModuleId,
    loading 
  };
}
