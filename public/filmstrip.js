

let viewportWidth = window.innerWidth;
window.addEventListener('resize', () => viewportWidth = window.innerWidth);


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
	const tryAttach = () => {
		const el = document.querySelector('#filmstrip');
		if (el) {
			attachWheelHandler(el);
			return true;
		}
		return false;
	};

	if (tryAttach()) return;

	const observer = new MutationObserver(() => {
		if (tryAttach()) {
			observer.disconnect();
		}
	});

	observer.observe(document.documentElement, { childList: true, subtree: true });
}

initFilmstripObserver();