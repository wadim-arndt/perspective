<script lang="ts">
	import { onMount } from 'svelte';

	// ─── Props ────────────────────────────────────────────────────────────────
	let {
		visible = false,
		progress = 0 // 0 = globe only, 1 = full solar system
	}: {
		visible: boolean;
		progress: number;
	} = $props();

	let container: HTMLDivElement;
	let renderer: any;
	let scene: any;
	let camera: any;
	let animationId: number;
	let isInitialized = false;

	// Scene objects
	let earthMesh: any;
	let atmosphereMesh: any;
	let sunMesh: any;
	let sunLight: any;
	let sunGlow: any;
	let planets: { mesh: any; orbit: any; distance: number; speed: number; angle: number; size: number }[] = [];

	// ─── Constants ────────────────────────────────────────────────────────────
	const EARTH_TEXTURE_URL = 'https://unpkg.com/three-globe@2.41.12/example/img/earth-blue-marble.jpg';

	const PLANET_DATA = [
		{ name: 'Mercury', color: 0xb5a7a7, distance: 4, speed: 0.015, size: 0.15 },
		{ name: 'Mars', color: 0xc1440e, distance: 8, speed: 0.006, size: 0.2 },
		{ name: 'Jupiter', color: 0xc88b3a, distance: 12, speed: 0.003, size: 0.5 },
		{ name: 'Saturn', color: 0xe8d5a3, distance: 16, speed: 0.002, size: 0.4 }
	];

	onMount(async () => {
		const THREE = await import('three');

		// ─── Renderer ──────────────────────────────────────────────────────
		renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true,
			powerPreference: 'high-performance'
		});
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setClearColor(0x000000, 0);
		container.appendChild(renderer.domElement);

		// ─── Scene ──────────────────────────────────────────────────────────
		scene = new THREE.Scene();

		// ─── Camera ─────────────────────────────────────────────────────────
		camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
		camera.position.set(0, 0, 4);

		// ─── Ambient Light ──────────────────────────────────────────────────
		const ambientLight = new THREE.AmbientLight(0x334466, 0.4);
		scene.add(ambientLight);

		// ─── Directional Light (initial sun-like) ───────────────────────────
		const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
		dirLight.position.set(5, 2, 5);
		scene.add(dirLight);

		// ─── Earth ──────────────────────────────────────────────────────────
		const earthGeom = new THREE.SphereGeometry(1, 64, 64);
		const textureLoader = new THREE.TextureLoader();

		// Load texture with fallback
		let earthMaterial: any;
		try {
			const earthTexture = await new Promise<any>((resolve, reject) => {
				textureLoader.load(
					EARTH_TEXTURE_URL,
					resolve,
					undefined,
					reject
				);
			});
			earthTexture.colorSpace = THREE.SRGBColorSpace;
			earthMaterial = new THREE.MeshPhongMaterial({
				map: earthTexture,
				specular: new THREE.Color(0x222244),
				shininess: 15
			});
		} catch {
			// Fallback: procedural earth-like material
			earthMaterial = new THREE.MeshPhongMaterial({
				color: 0x2244aa,
				specular: new THREE.Color(0x222244),
				shininess: 15
			});
		}

		earthMesh = new THREE.Mesh(earthGeom, earthMaterial);
		scene.add(earthMesh);

		// ─── Atmosphere Glow ────────────────────────────────────────────────
		const atmosphereGeom = new THREE.SphereGeometry(1.08, 64, 64);
		const atmosphereMat = new THREE.ShaderMaterial({
			vertexShader: `
				varying vec3 vNormal;
				varying vec3 vPosition;
				void main() {
					vNormal = normalize(normalMatrix * normal);
					vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				varying vec3 vNormal;
				varying vec3 vPosition;
				void main() {
					float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
					vec3 color = vec3(0.3, 0.6, 1.0);
					gl_FragColor = vec4(color, intensity * 0.6);
				}
			`,
			blending: THREE.AdditiveBlending,
			side: THREE.BackSide,
			transparent: true,
			depthWrite: false
		});
		atmosphereMesh = new THREE.Mesh(atmosphereGeom, atmosphereMat);
		scene.add(atmosphereMesh);

		// ─── Sun ────────────────────────────────────────────────────────────
		const sunGeom = new THREE.SphereGeometry(1.5, 32, 32);
		const sunMat = new THREE.MeshBasicMaterial({
			color: 0xffdd44,
			transparent: true,
			opacity: 0
		});
		sunMesh = new THREE.Mesh(sunGeom, sunMat);
		sunMesh.position.set(0, 0, 0);
		scene.add(sunMesh);

		// Sun glow sprite
		const glowCanvas = document.createElement('canvas');
		glowCanvas.width = 256;
		glowCanvas.height = 256;
		const glowCtx = glowCanvas.getContext('2d')!;
		const gradient = glowCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
		gradient.addColorStop(0, 'rgba(255, 230, 100, 0.8)');
		gradient.addColorStop(0.3, 'rgba(255, 200, 60, 0.4)');
		gradient.addColorStop(0.7, 'rgba(255, 160, 30, 0.1)');
		gradient.addColorStop(1, 'rgba(255, 140, 20, 0)');
		glowCtx.fillStyle = gradient;
		glowCtx.fillRect(0, 0, 256, 256);

		const glowTexture = new THREE.CanvasTexture(glowCanvas);
		const glowMat = new THREE.SpriteMaterial({
			map: glowTexture,
			blending: THREE.AdditiveBlending,
			transparent: true,
			opacity: 0
		});
		sunGlow = new THREE.Sprite(glowMat);
		sunGlow.scale.set(8, 8, 1);
		scene.add(sunGlow);

		// Sun point light
		sunLight = new THREE.PointLight(0xffeecc, 0, 100);
		sunLight.position.set(0, 0, 0);
		scene.add(sunLight);

		// ─── Planets + Orbit Rings ──────────────────────────────────────────
		for (const p of PLANET_DATA) {
			// Orbit ring
			const orbitGeom = new THREE.RingGeometry(p.distance - 0.02, p.distance + 0.02, 128);
			const orbitMat = new THREE.MeshBasicMaterial({
				color: 0xffffff,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 0
			});
			const orbit = new THREE.Mesh(orbitGeom, orbitMat);
			orbit.rotation.x = Math.PI / 2;
			scene.add(orbit);

			// Planet sphere
			const planetGeom = new THREE.SphereGeometry(p.size, 24, 24);
			const planetMat = new THREE.MeshPhongMaterial({
				color: p.color,
				transparent: true,
				opacity: 0,
				shininess: 30
			});
			const mesh = new THREE.Mesh(planetGeom, planetMat);
			const startAngle = Math.random() * Math.PI * 2;
			mesh.position.set(
				Math.cos(startAngle) * p.distance,
				0,
				Math.sin(startAngle) * p.distance
			);
			scene.add(mesh);

			// Saturn ring
			if (p.name === 'Saturn') {
				const saturnRingGeom = new THREE.RingGeometry(p.size * 1.3, p.size * 2.0, 48);
				const saturnRingMat = new THREE.MeshBasicMaterial({
					color: 0xe8d5a3,
					side: THREE.DoubleSide,
					transparent: true,
					opacity: 0
				});
				const saturnRing = new THREE.Mesh(saturnRingGeom, saturnRingMat);
				saturnRing.rotation.x = Math.PI / 2.5;
				mesh.add(saturnRing);
			}

			planets.push({ mesh, orbit, distance: p.distance, speed: p.speed, angle: startAngle, size: p.size });
		}

		// ─── Resize ─────────────────────────────────────────────────────────
		const handleResize = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
		};
		window.addEventListener('resize', handleResize);

		isInitialized = true;

		// ─── Animation Loop ─────────────────────────────────────────────────
		const animate = () => {
			animationId = requestAnimationFrame(animate);

			if (!visible || !isInitialized) return;

			// ── Earth rotation ──────────────────────────────────────────────
			earthMesh.rotation.y += 0.001;
			atmosphereMesh.rotation.y += 0.0008;

			// ── Solar system transition based on progress ────────────────────
			// progress: 0 = globe only (camera close), 1 = full solar system

			// Smoothly interpolate the progress for all values
			const p = Math.max(0, Math.min(1, progress));

			// Camera: pull back as progress increases
			// At p=0: camera at z=4 (close to earth)
			// At p=1: camera at z=35 (see entire solar system)
			const targetCamZ = 4 + p * 31;
			camera.position.z += (targetCamZ - camera.position.z) * 0.05;
			camera.position.y += (p * 12 - camera.position.y) * 0.05; // rise up
			camera.lookAt(0, 0, 0);

			// Earth position: at p=0 it's at origin, at p=1 it moves to its orbit (distance=6)
			const earthOrbitDist = 6;
			const earthAngle = Date.now() * 0.0001;
			const earthTargetX = p * Math.cos(earthAngle) * earthOrbitDist;
			const earthTargetZ = p * Math.sin(earthAngle) * earthOrbitDist;
			earthMesh.position.x += (earthTargetX - earthMesh.position.x) * 0.05;
			earthMesh.position.z += (earthTargetZ - earthMesh.position.z) * 0.05;
			atmosphereMesh.position.copy(earthMesh.position);

			// Sun visibility
			const sunOpacity = Math.max(0, (p - 0.1) / 0.4); // fade in from p=0.1 to p=0.5
			(sunMesh.material as any).opacity = sunOpacity;
			(sunGlow.material as any).opacity = sunOpacity * 0.7;
			sunLight.intensity = sunOpacity * 2;

			// Planets: fade in staggered
			for (let i = 0; i < planets.length; i++) {
				const pl = planets[i];
				const stagger = 0.2 + i * 0.15; // each planet appears later
				const planetOpacity = Math.max(0, Math.min(1, (p - stagger) / 0.3));

				(pl.mesh.material as any).opacity = planetOpacity;
				(pl.orbit.material as any).opacity = planetOpacity * 0.08;

				// Saturn ring
				if (pl.mesh.children.length > 0) {
					(pl.mesh.children[0] as any).material.opacity = planetOpacity * 0.5;
				}

				// Orbit motion
				if (planetOpacity > 0) {
					pl.angle += pl.speed;
					pl.mesh.position.set(
						Math.cos(pl.angle) * pl.distance,
						0,
						Math.sin(pl.angle) * pl.distance
					);
				}
			}

			renderer.render(scene, camera);
		};

		animate();

		return () => {
			cancelAnimationFrame(animationId);
			window.removeEventListener('resize', handleResize);
			renderer.dispose();
			if (container && renderer.domElement.parentNode === container) {
				container.removeChild(renderer.domElement);
			}
		};
	});
</script>

<div
	bind:this={container}
	class="globe-scene"
	class:visible
></div>

<style>
	.globe-scene {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 5;
		pointer-events: none;
		opacity: 0;
		transition: opacity 1.2s ease;
	}
	.globe-scene.visible {
		opacity: 1;
	}
	.globe-scene :global(canvas) {
		width: 100% !important;
		height: 100% !important;
	}
</style>
