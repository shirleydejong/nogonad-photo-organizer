'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icon';

interface HeaderProps {
	folderName: string | null;
	title?: string | null;
	isFullscreen?: boolean;
	children?: React.ReactNode;
	onCameraControlClick?: () => void;
	onStopCapture?: () => void;
}

export function Header({
	folderName,
	title = '',
	isFullscreen = false,
	children,
	onCameraControlClick,
	/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
	onStopCapture,
}: HeaderProps) {
	const router = useRouter();
	const [isVisible, setIsVisible] = useState(true);
	const lastScrollY = useRef(0);

	useEffect(() => {
		const handleScroll = () => {
			const currentScrollY = window.scrollY;
			if(currentScrollY <= 0) {
				setIsVisible(true);
			} else if(currentScrollY > lastScrollY.current) {
				setIsVisible(false);
			} else {
				setIsVisible(true);
			}
			lastScrollY.current = currentScrollY;
		};
		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	}, []);

	return (
		<header
			id="top-toolbar"
			className={`top-toolbar ${isVisible ? 'translate-y-0' : '-translate-y-full'} ${isFullscreen ? 'hidden' : ''}`}
		>
			<div className="flex items-center gap-3">
				<button
					className="header-button"
					onClick={() => router.push('/select-folder')}
				>
					<Icon name="arrow_back" /> Choose another folder
				</button>
				{folderName && <span className="text-zinc-500 text-sm truncate max-w-[12rem]">{folderName}</span>}
			</div>
			<div className="flex items-center justify-center flex-1 gap-4">
				{title && (
					<span className="text-zinc-300 text-m font-bold truncate max-w-[20rem]">{title}</span>
				)}
			</div>
			<div className="flex items-center gap-3">
				{onCameraControlClick && (
					<button
						className="header-button"
						onClick={onCameraControlClick}
						title="Camera Control"
					>
						<Icon name="camera" />
					</button>
				)}
				{children}
			</div>
		</header>
	);
}
