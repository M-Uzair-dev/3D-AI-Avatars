import AvatarStage from '@/components/AvatarStage.jsx';

// Stays a Server Component. The 'use client' boundary and the ssr:false dynamic
// import both live one level down, in AvatarStage.
export default function Home() {
  return <AvatarStage />;
}
