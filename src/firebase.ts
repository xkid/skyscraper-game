import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export type LeaderboardEntry = {
  id?: string;
  playerName: string;
  score: number;
  createdAt?: any;
};

export async function addScoreToLeaderboard(playerName: string, score: number) {
  try {
    await addDoc(collection(db, 'leaderboard'), {
      playerName,
      score,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to add score", err);
  }
}

export async function getTopScores(): Promise<LeaderboardEntry[]> {
  try {
    const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
  } catch (err) {
    console.error("Failed to get scores", err);
    return [];
  }
}
