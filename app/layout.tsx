import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { SITE_NAME, getSiteUrl } from '@/lib/site'

const geist = Geist({ subsets: ['latin'] })

const metadataTitle = SITE_NAME
const metadataDescription =
  'Predictions for MLB first inning (NRFI/YRFI) with advanced stats, Monte Carlo simulation, and machine learning calibration. Get the edge on your bets.'
const ogImageUrl = `${getSiteUrl()}/sharprfi-opengraph.png`

export const metadata: Metadata = {
  applicationName: 'RenteriaFirstInning',
  title: {
    absolute: metadataTitle,
    template: `%s | ${metadataTitle}`,
  },
  description: metadataDescription,
  keywords: [
    'MLB predictions',
    'NRFI',
    'YRFI',
    'first inning',
    'baseball betting',
    'statistical model',
    'Renteria',
  ],
  authors: [{ name: 'Francisco Renteria' }],
  creator: 'Francisco Renteria',
  icons: {
    icon: [{ url: '/sharprfi-ballmark.svg', type: 'image/svg+xml' }],
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
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} - MLB First-Inning Predictor`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: metadataTitle,
    description: metadataDescription,
    images: [ogImageUrl],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${geist.className} min-h-screen bg-background text-foreground`}>
        {children}
      </body>
    </html>
  )
}