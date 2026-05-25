import { NextResponse } from 'next/server';

export async function GET() {
  const assetlinks = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.onnet.studio',
        sha256_cert_fingerprints: [
          'B9:8B:3B:5A:AC:F5:2F:EA:8B:E4:2B:4D:7B:87:00:F8:7A:B2:79:3C:F4:1F:76:62:85:DC:B4:5B:71:93:71:CE'
        ],
      },
    },
  ];

  return NextResponse.json(assetlinks, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json',
    },
  });
}
