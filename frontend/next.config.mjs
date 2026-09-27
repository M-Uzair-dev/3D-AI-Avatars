/**
 * ---------------------------------------------------------------------------
 * WHY THIS FILE HAS HEADERS IN IT
 * ---------------------------------------------------------------------------
 * Everything in public/ was served `Cache-Control: public, max-age=0,
 * must-revalidate`, which is Next's default and the right default for a folder
 * that usually holds a favicon and an OG image. This one holds the cast: eight
 * models, six baked skyboxes and six animation clips.
 *
 * At max-age=0 a returning visitor revalidates every one of them. The bytes come
 * back 304 so the bandwidth is not spent twice, but the round trips are — and
 * they are round trips in front of a 3D scene that cannot start until they
 * finish. These assets are baked artefacts that change only when somebody
 * deliberately rebuilds them, which is the definition of `immutable`.
 *
 * ---------------------------------------------------------------------------
 * THE COST, WHICH IS REAL: `immutable` MEANS IMMUTABLE
 * ---------------------------------------------------------------------------
 * None of these filenames carries a content hash. `free-1.vrm` is `free-1.vrm`
 * whatever is inside it, so a browser that has cached one will not ask again for
 * a year, and RE-OPTIMISING A MODEL IN PLACE WILL NOT REACH ANYONE WHO HAS
 * ALREADY SEEN IT.
 *
 * If a model or a room is ever re-baked, it needs a new name — `free-1b.vrm`,
 * and the MODEL_NAMES key in lib/constants.js with it. That is the price of the
 * header and it is written down here and in DEPLOY.md rather than discovered
 * from a deployment that looks like it did not deploy.
 *
 * @type {import('next').NextConfig}
 */
const IMMUTABLE = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];

const nextConfig = {
  async headers() {
    return [
      // The models, which live at the root of public/. A regex parameter rather
      // than a folder pattern because that is where they are, and moving them
      // would mean touching MODEL_URL, the .gitignore exception list, ASSETS.md
      // and every measured pose's provenance.
      { source: '/:file(.*\\.vrm)', headers: IMMUTABLE },
      { source: '/animations/:path*', headers: IMMUTABLE },
      { source: '/backgrounds/:path*', headers: IMMUTABLE },
    ];
  },
};

export default nextConfig;
