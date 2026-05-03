import { Link } from 'react-router';
import type { MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [
  { title: 'Album Cover Generator' },
  { name: 'description', content: 'Glitch-aesthetic album cover generator. GPU effects, seeded randomness, environment map export.' },
];

export default function Home() {
  return (
    <div className="landing">
      <div className="landing-content">
        <h1 className="landing-title">Album Cover Generator</h1>
        <p className="landing-subtitle">
          Glitch-aesthetic covers with 16 GPU effects, seeded randomness, and equirectangular export for 3D environments.
        </p>
        <Link to="/app" className="btn btn-primary landing-cta">
          Open Generator →
        </Link>
      </div>
    </div>
  );
}
