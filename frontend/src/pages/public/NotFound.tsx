import { Link } from 'react-router-dom';
import styles from './NotFound.module.css';

export default function NotFound() {
    return (
        <main className={styles.page}>
            <section aria-labelledby="not-found-title" className={styles.card}>
                <p className={styles.code}>404</p>
                <h1 id="not-found-title">We couldn’t find that page</h1>
                <p>
                    The address may be incorrect, or the page may have moved.
                    Check the link or return to the portal home page.
                </p>
                <Link className={styles.link} to="/">
                    Go to home
                </Link>
            </section>
        </main>
    );
}
