import AvatarStage from '@/components/AvatarStage.jsx';

// Stays a Server Component. The 'use client' boundary and the ssr:false dynamic
// import both live one level down, in AvatarStage.
//
// `?dev=1` swaps the production bar for the full seven-tab workbench. It is read
// HERE, on the server, rather than from window.location in an effect, so the
// right surface renders on the first paint instead of flashing the wrong one.
//
// `searchParams` is a Promise in Next 16 and must be awaited — it was a plain
// object up to 14, which is what training data will tell you. See invariant 12.
export default async function Home({ searchParams }) {
  const dev = (await searchParams)?.dev === '1';
  return <AvatarStage dev={dev} />;
}
