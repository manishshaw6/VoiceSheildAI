import Spline from '@splinetool/react-spline'
import { Link } from 'react-router-dom'
import { useRef } from 'react'

export default function SplineHero() {
  const splineRef = useRef(null);

  const handleLoad = (splineApp) => {
    splineRef.current = splineApp;
    try {
      if (!splineApp) return;

      // 1. Maintain reduced size
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

  return (
    <section className="hero-spline" onWheelCapture={(event) => event.stopPropagation()}>
      <Spline scene="/Hero.splinecode" onLoad={handleLoad} />
      <Link
        to="/scanner"
        className="hero-join-hit-area"
        aria-label="Join VoxShield and launch the threat scanner"
      />
    </section>
  )
}



