import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  School,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Home.module.css";

const journey = [
  {
    step: "01",
    Icon: CalendarDays,
    title: "Set the stage",
    description: "Organisers create olympiads, prepare rounds and set clear dates for every stage.",
  },
  {
    step: "02",
    Icon: BookOpen,
    title: "Take part",
    description: "Schools and educators guide entrants, with online sittings and paper-based routes.",
  },
  {
    step: "03",
    Icon: ClipboardCheck,
    title: "See the outcome",
    description: "Submissions move through marking and results become available when released.",
  },
];

const audiences = [
  {
    number: "01 / ORGANISERS",
    Icon: ShieldCheck,
    title: "A clearer view of every round.",
    description: "Plan the schedule, oversee papers, review marking and keep the olympiad moving.",
    tag: "PLAN & OVERSEE",
  },
  {
    number: "02 / EDUCATORS",
    Icon: School,
    title: "Less admin. More opportunity.",
    description: "Manage school participation, work with round papers and submit learner results.",
    tag: "GUIDE & SUPPORT",
  },
  {
    number: "03 / STUDENTS",
    Icon: GraduationCap,
    title: "A place to show what you know.",
    description: "See your rounds, sit available online exams and follow your results.",
    tag: "EXPLORE & ACHIEVE",
  },
];

const slideNames = ["Welcome", "How it works", "Who it's for", "Get started"];
const slideHashes = ["#welcome", "#how-it-works", "#who-its-for", "#get-started"];

function indexFromHash() {
  return Math.max(0, slideHashes.indexOf(window.location.hash));
}

function Home() {
  const [activeSlide, setActiveSlide] = useState(indexFromHash);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const updateFromLocation = () => setActiveSlide(indexFromHash());
    window.addEventListener("hashchange", updateFromLocation);
    return () => window.removeEventListener("hashchange", updateFromLocation);
  }, []);

  const goToSlide = (index: number) => {
    const next = Math.max(0, Math.min(slideNames.length - 1, index));
    setActiveSlide(next);
  };

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>

      <header className={styles.header}>
        <nav aria-label="Main navigation" className={styles.nav}>
          <Link aria-label="Olympiad Portal home" className={styles.wordmark} onClick={() => goToSlide(0)} to="/">
            <span className={styles.brandMark}><Trophy aria-hidden="true" size={20} strokeWidth={1.9} /></span>
            <span className={styles.brandText}><strong>OLYMPIAD</strong><small>PORTAL</small></span>
          </Link>
          <div className={styles.navLinks}>
            <a aria-current={activeSlide === 1 ? "page" : undefined} href="#how-it-works" onClick={(event) => { event.preventDefault(); goToSlide(1); }}>How it works</a>
            <a aria-current={activeSlide === 2 ? "page" : undefined} href="#who-its-for" onClick={(event) => { event.preventDefault(); goToSlide(2); }}>Who it's for</a>
          </div>
          <div className={styles.navActions}>
            <Link className={styles.loginLink} to="/login">Log in</Link>
            <Link className={styles.navCta} to="/signup">Get started <ArrowUpRight aria-hidden="true" size={16} /></Link>
          </div>
        </nav>
      </header>

      <main className={styles.sliderShell} id="main-content">
        <div
          aria-label="Landing page sections. Use Left and Right arrows to navigate."
          className={styles.slideViewport}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowRight") { event.preventDefault(); goToSlide(activeSlide + 1); }
            if (event.key === "ArrowLeft") { event.preventDefault(); goToSlide(activeSlide - 1); }
          }}
          onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            const end = event.changedTouches[0]?.clientX;
            if (end === undefined || touchStartX.current === null) return;
            const distance = end - touchStartX.current;
            if (Math.abs(distance) > 65) goToSlide(activeSlide + (distance < 0 ? 1 : -1));
            touchStartX.current = null;
          }}
          onTouchCancel={() => { touchStartX.current = null; }}
          role="region"
          tabIndex={0}
        >
          <div className={styles.slideTrack} style={{ transform: `translateX(-${activeSlide * 100}%)` }}>
        <section aria-hidden={activeSlide !== 0} aria-labelledby="hero-title" className={`${styles.slide} ${styles.hero}`} id="welcome" inert={activeSlide !== 0}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}><span className={styles.eyebrowRule} /> THE HOME OF SCHOOL OLYMPIADS</div>
              <h1 id="hero-title">A place for <em>bright minds</em> to go further.</h1>
              <p className={styles.heroDescription}>
                From the first round to the final result, one thoughtful space for the people who make school olympiads happen.
              </p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryButton} to="/signup">Join the portal <ArrowUpRight aria-hidden="true" size={19} /></Link>
                <a className={styles.textButton} href="#how-it-works" onClick={(event) => { event.preventDefault(); goToSlide(1); }}>Explore how it works <ArrowRight aria-hidden="true" size={18} /></a>
              </div>
              <div className={styles.heroFootnote}>
                <span className={styles.footnoteIcon}><Check aria-hidden="true" size={15} /></span>
                <span>Built for organisers, educators and learners.</span>
              </div>
            </div>

            <div aria-label="Illustration of an olympiad exam paper and its round schedule" className={styles.heroArtwork} role="img">
              <div className={styles.artCorner} aria-hidden="true">01—03</div>
              <div className={styles.artOrbit} aria-hidden="true" />
              <div className={styles.artGrid} aria-hidden="true" />
              <div className={styles.paper} aria-hidden="true">
                <div className={styles.paperTopline}><span className={styles.paperPill}>SAMPLE ROUND</span><span className={styles.paperStars}>✳ ✳</span></div>
                <div className={styles.paperTitle}>An invitation to think <span>\u2197</span></div>
                <div className={styles.paperRule} />
                <div className={styles.paperMeta}><span>MATHEMATICS</span><span>QUESTION 01 / 03</span></div>
                <p className={styles.paperQuestion}>Which of these numbers is prime?</p>
                <div className={styles.answers}>
                  <span><i>A</i> 12</span>
                  <span className={styles.selectedAnswer}><i>B</i> 17 <Check size={16} strokeWidth={2.5} /></span>
                  <span><i>C</i> 21</span>
                  <span><i>D</i> 27</span>
                </div>
                <div className={styles.paperBottom}><span className={styles.progressBar}><b /></span><span>KEEP THINKING <ArrowRight size={13} /></span></div>
              </div>
              <div className={styles.artTag} aria-hidden="true"><span className={styles.artTagIcon}><Sparkles size={17} /></span><span>Curiosity<br /><strong>in motion</strong></span></div>
              <div className={styles.artCaption}>A SAMPLE OF WHAT'S POSSIBLE <span>\u2197</span></div>
            </div>
          </div>
          <div className={styles.heroBottomBar} aria-hidden="true"><span>THINK.</span><span>DISCOVER.</span><span>ACHIEVE.</span><span className={styles.heroBarEmblem}>✳</span></div>
        </section>

        <section aria-hidden={activeSlide !== 1} aria-labelledby="journey-title" className={`${styles.slide} ${styles.journey}`} id="how-it-works" inert={activeSlide !== 1}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionKicker}>THE JOURNEY / 01</span>
            <div className={styles.headingRow}>
              <h2 id="journey-title">A clear path from <em>start to finish.</em></h2>
              <p>Good competitions should challenge the mind, not complicate the process.</p>
            </div>
          </div>
          <div className={styles.journeyGrid}>
            {journey.map(({ step, Icon, title, description }) => (
              <article className={styles.journeyCard} key={step}>
                <div className={styles.journeyTop}><span>{step} / 03</span><Icon aria-hidden="true" size={26} strokeWidth={1.6} /></div>
                <h3>{title}</h3>
                <p>{description}</p>
                <div className={styles.cardCorner} aria-hidden="true">↗</div>
              </article>
            ))}
          </div>
        </section>

        <section aria-hidden={activeSlide !== 2} aria-labelledby="audience-title" className={`${styles.slide} ${styles.audiences}`} id="who-its-for" inert={activeSlide !== 2}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionKicker}>EVERY ROLE MATTERS / 02</span>
            <div className={styles.headingRow}>
              <h2 id="audience-title">One platform. <em>Many possibilities.</em></h2>
              <p>Made for the people behind every meaningful olympiad experience.</p>
            </div>
          </div>
          <div className={styles.audienceGrid}>
            {audiences.map(({ number, Icon, title, description, tag }) => (
              <article className={styles.audienceCard} key={number}>
                <div className={styles.audienceMeta}><span>{number}</span><Icon aria-hidden="true" size={24} strokeWidth={1.5} /></div>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <div className={styles.audienceTag}>{tag} <ChevronRight aria-hidden="true" size={15} /></div>
              </article>
            ))}
          </div>
        </section>

        <section aria-hidden={activeSlide !== 3} aria-labelledby="cta-title" className={`${styles.slide} ${styles.ctaSection}`} id="get-started" inert={activeSlide !== 3}>
          <div className={styles.ctaPanel}>
            <div className={styles.ctaEmblem} aria-hidden="true">✳</div>
            <span className={styles.ctaKicker}>YOUR NEXT CHAPTER BEGINS HERE</span>
            <h2 id="cta-title">Great things begin <em>with a question.</em></h2>
            <p>Whether you're running an olympiad or taking part in one, there's a place for you here.</p>
            <div className={styles.ctaButtons}>
              <Link className={styles.ctaPrimary} to="/signup">Create an account <ArrowUpRight aria-hidden="true" size={19} /></Link>
              <Link className={styles.ctaSecondary} to="/login">I already have an account <ArrowRight aria-hidden="true" size={18} /></Link>
            </div>
          </div>
        </section>
          </div>
        </div>
        <nav aria-label="Landing page slide navigation" className={styles.slideControls}>
          <div aria-hidden="true" className={styles.slideSpacer} />
          <div aria-label="Choose landing page section" className={styles.slideDots} role="group">
            {slideNames.map((name, index) => (
              <button
                aria-label={`Show ${name}`}
                aria-pressed={activeSlide === index}
                className={`${styles.slideDot} ${activeSlide === index ? styles.slideDotActive : ""}`}
                key={name}
                onClick={() => goToSlide(index)}
                type="button"
              />
            ))}
          </div>
          <div className={styles.slideArrows}>
            <button aria-label="Previous section" disabled={activeSlide === 0} onClick={() => goToSlide(activeSlide - 1)} type="button"><ArrowLeft aria-hidden="true" size={20}/></button>
            <button aria-label="Next section" disabled={activeSlide === 3} onClick={() => goToSlide(activeSlide + 1)} type="button"><ArrowRight aria-hidden="true" size={20}/></button>
          </div>
        </nav>
      </main>
      <footer className={styles.footer}>
        <Link className={styles.footerBrand} to="/"><Trophy aria-hidden="true" size={19} /> Olympiad Portal</Link>
        <span>Where learning meets opportunity.</span>
        <a href="#welcome" onClick={(event) => { event.preventDefault(); goToSlide(0); }}>Back to first section ↑</a>
      </footer>
    </div>
  );
}

export default Home;
