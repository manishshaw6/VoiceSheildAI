import Spline from '@splinetool/react-spline'
import { Link } from 'react-router-dom'

export default function SplineHero() {
  return (
    <section className="hero-spline" onWheelCapture={(event) => event.stopPropagation()}>
      <Spline scene="/Hero.splinecode" />
      <Link
        to="/auth"
        className="hero-join-hit-area"
        aria-label="Join VoxShield and launch the threat scanner"
      />
    </section>
  )
}
