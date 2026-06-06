import { useEffect } from 'react';

export function useWebcam(videoRef: React.RefObject<HTMLVideoElement | null>) {
  useEffect(() => {
    let stream: MediaStream | null = null;

    const initWebcam = async () => {
      if (!videoRef.current) return;
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      const constraints = {
        video: isMobile 
          ? { facingMode: { ideal: "user" } } 
          : { facingMode: "user" }
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (err) {
        console.warn("Primary webcam constraints failed, attempting fallback:", err);
        try {
          // Fallback to any available video camera
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
          }
        } catch (fbErr) {
          console.error("Error accessing any webcam:", fbErr);
        }
      }
    };

    initWebcam();

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [videoRef]);
}
