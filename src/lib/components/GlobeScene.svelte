<script lang="ts">
	import { onMount } from 'svelte';

	// ─── Props ────────────────────────────────────────────────────────────────
	let {
		visible = false,
		progress = 0, // 0 = globe only, 1 = full solar system
		interactive = false // whether drag panning is enabled
	}: {
		visible: boolean;
		progress: number;
		interactive: boolean;
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
	let planets: { mesh: any; orbit: any; distance: number; speed: number; angle: number; size: number; name: string }[] = [];

	// ─── Drag / Pan State ─────────────────────────────────────────────────────
	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let cameraOffsetX = $state(0); // accumulated camera pan offset
	let cameraOffsetZ = $state(0);
	let velocityX = 0; // inertia velocity
	let velocityZ = 0;
	let lastDragX = 0;
	let lastDragY = 0;
	
	let needsReset = $derived(Math.abs(cameraOffsetX) > 2 || Math.abs(cameraOffsetZ) > 2);

	const DRAG_SENSITIVITY = 0.02; // Reduced for slower movement
	const INERTIA_DECAY = 0.85;    // Stronger damping / less sliding
	const INERTIA_THRESHOLD = 0.001;
	const MAX_OFFSET_X = 30;       // Constrain navigation area
	const MAX_OFFSET_Z = 30;

	// ─── Constants ────────────────────────────────────────────────────────────
	const EARTH_TEXTURE_URL = 'https://unpkg.com/three-globe@2.41.12/example/img/earth-blue-marble.jpg';

	// All 8 planets in correct order from Sun.
	// Distances are perceptually scaled (compressed) for readability.
	// Sizes are exaggerated relative to real scale for visibility.
	const PLANET_DATA = [
		{ name: 'Mercury',  color: 0xb5a7a7, distance: 3.0,  speed: 0.012,  size: 0.10 },
		{ name: 'Venus',    color: 0xe8cda0, distance: 4.5,  speed: 0.009,  size: 0.18 },
		{ name: 'Earth',    color: 0x000000, distance: 6.0,  speed: 0.007,  size: 0.20, isEarth: true },
		{ name: 'Mars',     color: 0xc1440e, distance: 8.0,  speed: 0.005,  size: 0.15 },
		{ name: 'Jupiter',  color: 0xc88b3a, distance: 12.0, speed: 0.002,  size: 0.55 },
		{ name: 'Saturn',   color: 0xe8d5a3, distance: 16.0, speed: 0.0015, size: 0.45 },
		{ name: 'Uranus',   color: 0x7ec8e3, distance: 20.0, speed: 0.001,  size: 0.32 },
		{ name: 'Neptune',  color: 0x3b5ddb, distance: 24.0, speed: 0.0008, size: 0.30 }
	];

	// ─── Drag Event Handlers ──────────────────────────────────────────────────
	const onPointerDown = (e: PointerEvent) => {
		if (!interactive || !visible) return;
		isDragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		lastDragX = e.clientX;
		lastDragY = e.clientY;
		velocityX = 0;
		velocityZ = 0;
		(e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
	};

	const onPointerMove = (e: PointerEvent) => {
		if (!isDragging || !interactive) return;
		const dx = e.clientX - lastDragX;
		const dy = e.clientY - lastDragY;
		lastDragX = e.clientX;
		lastDragY = e.clientY;

		// Convert screen drag to camera offset (X = horizontal, Z = depth-ish mapped from vertical)
		const sensitivity = DRAG_SENSITIVITY * (1 + progress * 1.5); // reduced scaling
		
		let dxEff = dx * sensitivity;
		let dyEff = dy * sensitivity;

		// Soft resistance when pushing past boundaries
		if ((cameraOffsetX > MAX_OFFSET_X && dxEff < 0) || (cameraOffsetX < -MAX_OFFSET_X && dxEff > 0)) {
			dxEff *= 0.15;
		}
		if ((cameraOffsetZ > MAX_OFFSET_Z && dyEff < 0) || (cameraOffsetZ < -MAX_OFFSET_Z && dyEff > 0)) {
			dyEff *= 0.15;
		}

		cameraOffsetX -= dxEff;
		cameraOffsetZ -= dyEff;

		// Smooth velocity calculation to prevent flicking spikes
		velocityX = (velocityX * 0.5) + (-dxEff * 0.5);
		velocityZ = (velocityZ * 0.5) + (-dyEff * 0.5);
	};

	const onPointerUp = (_e: PointerEvent) => {
		isDragging = false;
	};

	const resetCamera = () => {
		cameraOffsetX = 0;
		cameraOffsetZ = 0;
		velocityX = 0;
		velocityZ = 0;
	};

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

			// For Earth in the solar system, reuse the textured earth mesh
			// We skip creating a separate sphere — Earth IS the earthMesh, repositioned
			if ((p as any).isEarth) {
				// Earth's orbit ring added, but the mesh is earthMesh itself
				const startAngle = Math.random() * Math.PI * 2;
				planets.push({ mesh: earthMesh, orbit, distance: p.distance, speed: p.speed, angle: startAngle, size: p.size, name: p.name });
				continue;
			}

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

			// Uranus subtle ring
			if (p.name === 'Uranus') {
				const uranusRingGeom = new THREE.RingGeometry(p.size * 1.2, p.size * 1.6, 48);
				const uranusRingMat = new THREE.MeshBasicMaterial({
					color: 0x7ec8e3,
					side: THREE.DoubleSide,
					transparent: true,
					opacity: 0
				});
				const uranusRing = new THREE.Mesh(uranusRingGeom, uranusRingMat);
				uranusRing.rotation.x = Math.PI / 1.5; // Uranus tilted axis
				mesh.add(uranusRing);
			}

			planets.push({ mesh, orbit, distance: p.distance, speed: p.speed, angle: startAngle, size: p.size, name: p.name });
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

			// ── Inertia: apply velocity when not dragging ───────────────────
			if (!isDragging) {
				if (Math.abs(velocityX) > INERTIA_THRESHOLD || Math.abs(velocityZ) > INERTIA_THRESHOLD) {
					cameraOffsetX += velocityX;
					cameraOffsetZ += velocityZ;
					velocityX *= INERTIA_DECAY;
					velocityZ *= INERTIA_DECAY;
				} else {
					velocityX = 0;
					velocityZ = 0;
				}

				// Soft boundary pull-back
				const returnSpeed = 0.03;
				if (cameraOffsetX > MAX_OFFSET_X) cameraOffsetX += (MAX_OFFSET_X - cameraOffsetX) * returnSpeed;
				if (cameraOffsetX < -MAX_OFFSET_X) cameraOffsetX += (-MAX_OFFSET_X - cameraOffsetX) * returnSpeed;
				if (cameraOffsetZ > MAX_OFFSET_Z) cameraOffsetZ += (MAX_OFFSET_Z - cameraOffsetZ) * returnSpeed;
				if (cameraOffsetZ < -MAX_OFFSET_Z) cameraOffsetZ += (-MAX_OFFSET_Z - cameraOffsetZ) * returnSpeed;
			}

			// ── Earth rotation ──────────────────────────────────────────────
			earthMesh.rotation.y += 0.001;
			atmosphereMesh.rotation.y += 0.0008;

			// ── Solar system transition based on progress ────────────────────
			// progress: 0 = globe only (camera close), 1 = full solar system
			const p = Math.max(0, Math.min(1, progress));

			// Camera: pull back as progress increases, apply drag offset
			const targetCamZ = 4 + p * 46; // further back to see Neptune at distance 24
			const targetCamY = p * 18;
			camera.position.z += (targetCamZ + cameraOffsetZ - camera.position.z) * 0.05;
			camera.position.y += (targetCamY - camera.position.y) * 0.05;
			camera.position.x += (cameraOffsetX - camera.position.x) * 0.05;

			// Camera looks at the offset center (follows the drag)
			const lookX = cameraOffsetX * 0.5;
			const lookZ = cameraOffsetZ * 0.3;
			camera.lookAt(lookX, 0, lookZ);

			// Earth position: at p=0 it's at origin, at p=1 it moves to its orbit
			const earthPlanet = planets.find(pl => pl.name === 'Earth');
			if (earthPlanet) {
				const earthTargetX = p * Math.cos(earthPlanet.angle) * earthPlanet.distance;
				const earthTargetZ = p * Math.sin(earthPlanet.angle) * earthPlanet.distance;
				earthMesh.position.x += (earthTargetX - earthMesh.position.x) * 0.05;
				earthMesh.position.z += (earthTargetZ - earthMesh.position.z) * 0.05;
				earthMesh.position.y = 0;
				atmosphereMesh.position.copy(earthMesh.position);

				// Slowly orbit Earth
				if (p > 0.1) {
					earthPlanet.angle += earthPlanet.speed;
				}
			}

			// Sun visibility
			const sunOpacity = Math.max(0, (p - 0.1) / 0.4); // fade in from p=0.1 to p=0.5
			(sunMesh.material as any).opacity = sunOpacity;
			(sunGlow.material as any).opacity = sunOpacity * 0.7;
			sunLight.intensity = sunOpacity * 2;

			// Planets: fade in staggered (skip Earth, it's handled above)
			for (let i = 0; i < planets.length; i++) {
				const pl = planets[i];
				if (pl.name === 'Earth') continue; // Earth is the globe itself

				const stagger = 0.15 + i * 0.08; // each planet appears sequentially
				const planetOpacity = Math.max(0, Math.min(1, (p - stagger) / 0.25));

				(pl.mesh.material as any).opacity = planetOpacity;
				(pl.orbit.material as any).opacity = planetOpacity * 0.06;

				// Saturn/Uranus ring opacity
				if (pl.mesh.children.length > 0) {
					(pl.mesh.children[0] as any).material.opacity = planetOpacity * 0.4;
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

			// Earth orbit ring opacity (same stagger as Earth index=2)
			if (earthPlanet) {
				const earthStagger = 0.15 + 2 * 0.08;
				const earthOrbitOpacity = Math.max(0, Math.min(1, (p - earthStagger) / 0.25));
				(earthPlanet.orbit.material as any).opacity = earthOrbitOpacity * 0.06;
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
	class:interactive
	role="application"
	tabindex="-1"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	ondblclick={resetCamera}
>
	{#if visible && interactive && needsReset}
		<button class="reset-btn" onclick={resetCamera} aria-label="Recenter view">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="3"></circle>
				<path d="M19 12a7 7 0 0 0-7-7 7 7 0 0 0-7 7 7 7 0 0 0 7 7"></path>
			</svg>
			Recenter
		</button>
	{/if}
</div>

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
		cursor: default;
	}
	.globe-scene.visible {
		opacity: 1;
	}
	.globe-scene.interactive {
		pointer-events: all;
		cursor: grab;
	}
	.globe-scene.interactive:active {
		cursor: grabbing;
	}
	.globe-scene :global(canvas) {
		width: 100% !important;
		height: 100% !important;
	}
	.reset-btn {
		position: absolute;
		bottom: 40px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(10, 12, 20, 0.5);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
		font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
		font-size: 13px;
		letter-spacing: 0.05em;
		padding: 8px 16px;
		border-radius: 20px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		z-index: 10;
		transition: all 0.3s ease;
		pointer-events: auto;
		box-shadow: 0 4px 16px rgba(0,0,0,0.3);
	}
	.reset-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		border-color: rgba(255, 255, 255, 0.3);
	}
	.reset-btn svg {
		width: 16px;
		height: 16px;
	}
</style>
