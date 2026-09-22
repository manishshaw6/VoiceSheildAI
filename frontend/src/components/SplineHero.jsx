import Spline from '@splinetool/react-spline'
import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'

export default function SplineHero() {
  const splineRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 700px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const updateViewport = () => {
      setIsMobile(media.matches);
      if (splineRef.current?.setZoom) splineRef.current.setZoom(media.matches ? 0.76 : 0.85);
    };
    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  const handleLoad = (splineApp) => {
    splineRef.current = splineApp;
    try {
      if (!splineApp) return;

      // The desktop scene remains untouched.
      if (typeof splineApp.setZoom === 'function') {
        splineApp.setZoom(0.85);
      }

      // 2. Enable silky smooth inertia and damping on 3D motion controls
      if (splineApp.controls) {
        splineApp.controls.enableDamping = true;
        splineApp.controls.dampingFactor = 0.045; // Silky fluid deceleration
        splineApp.controls.rotateSpeed = 0.55; // Gentle, natural responsiveness
        splineApp.controls.zoomSpeed = 0.5;
        splineApp.controls.panSpeed = 0.5;
      }
    } catch (err) {
      console.warn('Spline smoothing notice:', err);
    }
  };

  if (isMobile) {
    return (
      <section className="mobile-hero" aria-label="VoiceShield AI protection">
        <div className="mobile-hero-copy">
          <h1>The Voice You Trust<br />Might Be Hiding<br /><span>A Scam.</span></h1>
        </div>
        <div className="mobile-hero-bottom">
          <p>AI-powered protection against voice cloning, deepfakes, and real-time voice fraud.</p>
          <Link to="/auth" className="mobile-hero-cta">Join us now</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="hero-spline" onWheelCapture={(event) => event.stopPropagation()}>
      <Spline scene="/Hero.splinecode" onLoad={handleLoad} />
      <Link to="/auth" className="hero-join-hit-area" aria-label="Join VoxShield and launch the threat scanner" />
    </section>
  );
}



