import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Radio Studio',
    short_name: 'Radio Studio',
    description: 'Egonair Radio Studio',
    start_url: '/',
    display: 'standalone',
    background_color: '#8B0000',
    theme_color: '#8B0000',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
