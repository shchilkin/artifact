import type { MetaFunction } from 'react-router';
import MotionLab from '../features/motion-lab/MotionLab';

export const meta: MetaFunction = () => [
  { title: 'Motion Lab | Artifact' },
  { name: 'description', content: 'Development harness for document-backed Mixed Media Artwork.' },
];

export default MotionLab;
