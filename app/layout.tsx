import type { Metadata } from 'next';
import { Geist, Geist_Mono, Noto_Color_Emoji } from 'next/font/google';

import { Toaster } from 'react-hot-toast';
import './globals.css';

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
});

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
});

const notoColorEmoji = Noto_Color_Emoji({
	weight: '400',
	variable: '--font-noto-color-emoji',
});

export const metadata: Metadata = {
	title: 'Nogonad Photo Organizer',
	description: 'Photo organizer',
};

export default function RootLayout({
	children,
}: Readonly<{
  children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
				<link
					href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
					rel="stylesheet"
				/>
			</head>
			<body
				className={`${geistSans.variable} ${geistMono.variable} ${notoColorEmoji.variable} antialiased`}
			>
				<Toaster
					position="bottom-right"
					toastOptions={{
						duration: 4000,
						style: {
							background: '#18181b',
							color: '#fafafa',
							border: '1px solid #27272a',
						},
						success: {
							iconTheme: {
								primary: '#22c55e',
								secondary: '#fafafa',
							},
						},
						error: {
							iconTheme: {
								primary: '#ef4444',
								secondary: '#fafafa',
							},
						},
					}}
				/>
				{children}
			</body>
		</html>
	);
}
