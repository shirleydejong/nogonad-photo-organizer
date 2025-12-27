

let viewportWidth = window.innerWidth;
window.addEventListener('resize', () => viewportWidth = window.innerWidth);
let zoomLevel = 1;

function attachWheelHandler(el) {
	if (!el) return;

	const handler = (ev) => {
		if (ev.currentTarget.scrollWidth > ev.currentTarget.clientWidth) {
			ev.preventDefault();
			const scrollAmount = Math.abs(ev.deltaY) > Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX;
			ev.currentTarget.scrollLeft += scrollAmount > 0 ? (viewportWidth/2) : 0 - (viewportWidth/2);
		}
	};

	el.addEventListener('wheel', handler, { passive: false });
}

function initFilmstripObserver() {
	const tryAttachFilmstrip = () => {
		const el = document.querySelector('#filmstrip');
		if (el) {
			attachWheelHandler(el);
			return true;
		}
		return false;
	};

	if (tryAttachFilmstrip()) return;

	const observer = new MutationObserver(() => {
		if (tryAttachFilmstrip()) {
			observer.disconnect();
		}
	});

	observer.observe(document.documentElement, { childList: true, subtree: true });
}

initFilmstripObserver();

function attachZoomHandler(el) {
	if (!el) return;
	
	
	const handler = (ev) => {
		ev.currentTarget.style.transformOrigin = `${ev.offsetX}px ${ev.offsetY}px`;
		
		zoomLevel -= ev.deltaY * 0.005;
		if (zoomLevel < 1) zoomLevel = 1;
		if (zoomLevel > 10) zoomLevel = 10;
		
		ev.currentTarget.style.transform = `scale(${zoomLevel})`;
		
	};
	
	el.addEventListener('wheel', handler, { passive: false });
	
	const imgObserver = new MutationObserver(() => el.style.transform = `scale(1)`);
	imgObserver.observe(el, { attributes: true, attributeFilter: ['src'] });
}

function initImageObserver() {
	const tryAttachMainImage = () => {
		const mainImage = document.querySelectorAll('.main-image');
		if (mainImage.length > 0) {
			mainImage.forEach(element => attachZoomHandler(element));
			return true;
		}
		return false;
	};

	if (tryAttachMainImage()) return;

	const observer = new MutationObserver(() => {
		if (tryAttachMainImage()) {
			observer.disconnect();
		}
	});

	observer.observe(document.documentElement, { childList: true, subtree: true });
}

initImageObserver();

//function zoomImage(imgElement, zoomIn) {