import { useEffect, useRef, useState } from 'react';
import { GestureRecognizer, FilesetResolver, GestureRecognizerResult } from '@mediapipe/tasks-vision';

export type Gesture = 'rock' | 'paper' | 'scissors' | 'unknown';

export function useGestureRecognizer() {
  const [recognizer, setRecognizer] = useState<GestureRecognizer | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        if (active) {
          setRecognizer(recognizer);
          setIsReady(true);
        }
      } catch (err) {
        console.error("Failed to initialize MediaPipe", err);
      }
    };
    init();
    return () => {
      active = false;
    }
  }, []);

  return { recognizer, isReady };
}

export function detectGesture(recognizer: GestureRecognizer, videoElement: HTMLVideoElement): Gesture {
  try {
    const results = recognizer.recognizeForVideo(videoElement, performance.now());
    if (results.gestures.length > 0) {
      const topGesture = results.gestures[0][0];
      const category = topGesture.categoryName;
      
      // Sometimes it detects 'None' or other random things. Let's map it.
      if (category === 'Closed_Fist') return 'rock';
      if (category === 'Open_Palm') return 'paper';
      if (category === 'Victory') return 'scissors';
      if (category === 'ILoveYou') return 'rock'; // some people do this for rock loosely
      if (category === 'Pointing_Up') return 'scissors'; // mapping just in case
    }
  } catch (err) {
    // console.error("Recognition error", err);
  }
  return 'unknown';
}
