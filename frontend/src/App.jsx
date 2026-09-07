import './App.css'
import SplineHero from './components/SplineHero'

function App() {
  return (
    <div className="page-shell">
      <header className="site-header">
        <a className="brand" href="#top">
          VOXSHIELD
        </a>
        <nav className="site-nav" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <main id="top">
        <SplineHero />

        <section className="content-section" id="features">
          <div className="section-copy">
            <p className="section-label">Features</p>
            <h2>Built to keep the landing page structure intact.</h2>
            <p>
              The Spline scene lives only in the hero area, so the rest of the page
              can continue to hold your product messaging, feature blocks, and calls to action.
            </p>
          </div>
        </section>

        <section className="content-section" id="about">
          <div className="section-copy">
            <p className="section-label">About</p>
            <h2>Clean integration, minimal surface area.</h2>
            <p>
              This setup uses the official React Spline package with your local
              <code>/Hero.splinecode</code> file, avoiding iframes and external URLs.
            </p>
          </div>
        </section>

        <section className="content-section" id="contact">
          <div className="section-copy">
            <p className="section-label">Contact</p>
            <h2>Ready for your existing content.</h2>
            <p>
              Replace these supporting sections with your current landing-page blocks if
              you already have them in another branch or file.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
