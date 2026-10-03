import type { MetaFunction } from 'react-router';
import CoverMotionLab from '../features/cover-motion/CoverMotionLab';

export const meta: MetaFunction = () => [
  { title: 'Cover Motion | Artifact' },
  { name: 'description', content: 'Development harness for rendering looping cover motion.' },
];

export default CoverMotionLab;
