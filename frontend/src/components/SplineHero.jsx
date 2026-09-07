import Spline from '@splinetool/react-spline'

export default function SplineHero() {
  return (
    <section className="hero-spline" onWheelCapture={(event) => event.stopPropagation()}>
      <Spline scene="/Hero.splinecode" />
    </section>
  )
}
