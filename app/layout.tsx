import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { SITE_NAME, getSiteUrl } from '@/lib/site'

const geist = Geist({ subsets: ['latin'] })
const metadataTitle = SITE_NAME
const metadataDescription = 'One model, both sides of the first inning. Find the minimum odds you need to bet NRFI or YRFI with a statistical edge. Updated daily.'
const ogImageUrl = `${getSiteUrl()}/sharprfi-opengraph.png`

export const metadata: Metadata = {
  applicationName: 'sharprfi',
  title: {
    absolute: metadataTitle,
  },
  description: metadataDescription,
  icons: {
    icon: [
      { url: '/sharprfi-ballmark.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/sharprfi-ballmark.svg',
    apple: '/sharprfi-ballmark.svg',
  },
  openGraph: {
    title: metadataTitle,
    description: metadataDescription,
    url: getSiteUrl(),
    siteName: SITE_NAME,
    type: 'website',
    images: [
      {
        url: ogImageUrl,
        alt: 'SHARPRFI open graph image',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: metadataTitle,
    description: metadataDescription,
    images: [ogImageUrl],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={geist.className}>
        {children}
      </body>
    </html>
  )
}
