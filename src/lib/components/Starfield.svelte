<script lang="ts">
	import { onMount } from 'svelte';

	// ─── Props ────────────────────────────────────────────────────────────────
	let { visible = false }: { visible: boolean } = $props();

	let canvas: HTMLCanvasElement;
	let animationId: number;
	let mouseX = 0;
	let mouseY = 0;

	interface Star {
		x: number;
		y: number;
		size: number;
		brightness: number;
		layer: number; // 0 = far, 1 = mid, 2 = near
		twinkleSpeed: number;
		twinkleOffset: number;
	}

	onMount(() => {
		const ctx = canvas.getContext('2d')!;
		let stars: Star[] = [];
		let time = 0;
		let w = 0;
		let h = 0;

		const STAR_COUNT = 450;
		const LAYER_SPEEDS = [0.02, 0.05, 0.1]; // parallax speeds per layer
		const PARALLAX_STRENGTH = [8, 18, 30]; // mouse parallax px per layer

		const resize = () => {
			w = window.innerWidth;
			h = window.innerHeight;
			canvas.width = w;
			canvas.height = h;
		};

		const generateStars = () => {
			stars = [];
			for (let i = 0; i < STAR_COUNT; i++) {
				const layer = i < 200 ? 0 : i < 350 ? 1 : 2;
				stars.push({
					x: Math.random() * w,
					y: Math.random() * h,
					size: layer === 0 ? 0.5 + Math.random() * 0.8 : layer === 1 ? 0.8 + Math.random() * 1.2 : 1.2 + Math.random() * 1.8,
					brightness: 0.3 + Math.random() * 0.7,
					layer,
					twinkleSpeed: 0.5 + Math.random() * 2,
					twinkleOffset: Math.random() * Math.PI * 2
				});
			}
		};

		const draw = () => {
			time += 0.016;
			ctx.clearRect(0, 0, w, h);

			// Normalized mouse position (-0.5 to 0.5)
			const mx = (mouseX / w - 0.5);
			const my = (mouseY / h - 0.5);

			for (const star of stars) {
				// Drift
				const drift = time * LAYER_SPEEDS[star.layer];
				// Parallax from mouse
				const px = mx * PARALLAX_STRENGTH[star.layer];
				const py = my * PARALLAX_STRENGTH[star.layer];

				let sx = ((star.x + drift * 10 + px) % w + w) % w;
				let sy = ((star.y + drift * 3 + py) % h + h) % h;

				// Twinkle
				const twinkle = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
				const alpha = star.brightness * (0.4 + 0.6 * twinkle);

				ctx.beginPath();
				ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
				ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
				ctx.fill();
			}

			animationId = requestAnimationFrame(draw);
		};

		const handleMouseMove = (e: MouseEvent) => {
			mouseX = e.clientX;
			mouseY = e.clientY;
		};

		resize();
		generateStars();
		draw();

		window.addEventListener('resize', resize);
		window.addEventListener('mousemove', handleMouseMove);

		return () => {
			cancelAnimationFrame(animationId);
			window.removeEventListener('resize', resize);
			window.removeEventListener('mousemove', handleMouseMove);
		};
	});
</script>

<canvas
	bind:this={canvas}
	class="starfield"
	class:visible
></canvas>

<style>
	.starfield {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 1;
		pointer-events: none;
		opacity: 0;
		transition: opacity 1.5s ease;
	}
	.starfield.visible {
		opacity: 1;
	}
</style>
