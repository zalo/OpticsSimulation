import * as THREE from '../node_modules/three/build/three.module.js';
import { GUI } from '../node_modules/three/examples/jsm/libs/lil-gui.module.min.js';
import World from './World.js';
import { TransformControls } from '../node_modules/three/examples/jsm/controls/TransformControls.js';
import PhysicalDoFCamera from './PhysicalDoFCamera.js';
import { RGBELoader } from '../node_modules/three/examples/jsm/loaders/RGBELoader.js';

/** The fundamental set up and animation structures for Simulation */
export default class Main {
    constructor() {
        // Intercept Main Window Errors
        window.realConsoleError = console.error;
        window.addEventListener('error', (event) => {
            let path = event.filename.split("/");
            this.display((path[path.length - 1] + ":" + event.lineno + " - " + event.message));
        });
        console.error = this.fakeError.bind(this);
        this.timeMS = 0;
        this.deferredConstructor();
    }

    async deferredConstructor() {
        // Configure Settings
        this.simulationParams = {
            numViews: 4,
            resolution: 4096,
            aperture: 0.05,
            focalDistance: 1.73,
            mirrorEnabled: true,
            mirrorPosition: { x: 0.0, y: 0.0, z: 0.0 },
            mirrorNormal: { x: 1.0, y: 0.0, z: 0.0 },
            mirrorRadius: 0.25
        };
        this.gui = new GUI();
        this.gui.add(this.simulationParams, 'numViews', 1, 10, 1).name('Number of Views')           .onChange((value) => { this.physicalCamera.numViews      = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'resolution', 256, 4096, 256).name('Resolution')        .onChange((value) => { this.physicalCamera.resolution    = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'aperture', 0.0, 0.1, 0.01).name('Aperture Size')       .onChange((value) => { this.physicalCamera.aperture      = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'focalDistance', 0.4, 5.0, 0.01).name('Focal Distance').onChange((value) => { this.physicalCamera.focalDistance = value; this.physicalCamera.setupCamera(); });
        // Mirror controls
        const mirrorFolder = this.gui.addFolder('Planar Mirror');
        mirrorFolder.add(this.simulationParams, 'mirrorEnabled').name('Enable Mirror').onChange((value) => { this.raytracedShaderMaterial.uniforms.mirrorEnabled.value = value; });
        mirrorFolder.add(this.simulationParams.mirrorPosition, 'x', -3.0, 3.0, 0.01).name('Position X').onChange((value) => { this.raytracedShaderMaterial.uniforms.mirrorPosition.value.x = value; });
        mirrorFolder.add(this.simulationParams.mirrorPosition, 'y', -3.0, 3.0, 0.01).name('Position Y').onChange((value) => { this.raytracedShaderMaterial.uniforms.mirrorPosition.value.y = value; });
        mirrorFolder.add(this.simulationParams.mirrorPosition, 'z', -3.0, 3.0, 0.01).name('Position Z').onChange((value) => { this.raytracedShaderMaterial.uniforms.mirrorPosition.value.z = value; });
        mirrorFolder.add(this.simulationParams.mirrorNormal, 'x', -1.0, 1.0, 0.01).name('Normal X').onChange((value) => { this.updateMirrorNormal(); });
        mirrorFolder.add(this.simulationParams.mirrorNormal, 'y', -1.0, 1.0, 0.01).name('Normal Y').onChange((value) => { this.updateMirrorNormal(); });
        mirrorFolder.add(this.simulationParams.mirrorNormal, 'z', -1.0, 1.0, 0.01).name('Normal Z').onChange((value) => { this.updateMirrorNormal(); });
        mirrorFolder.add(this.simulationParams, 'mirrorRadius', 0.1, 2.0, 0.01).name('Mirror Radius').onChange((value) => { this.raytracedShaderMaterial.uniforms.mirrorRadius.value = value; });

        // Construct the render world
        this.world = new World(this);

		new RGBELoader()
			.setPath('assets/')
			.load('quarry_01_1k.hdr', (texture) => {
				texture.mapping = THREE.EquirectangularReflectionMapping;
				this.world.scene.background = texture;
				this.world.scene.environment = texture;

                this.physicalCamera = new PhysicalDoFCamera(this.world.renderer, this.world.scene, this.world.camera);
                window.addEventListener(           'resize', () => { this.physicalCamera.setupCamera(); }, false);
                window.addEventListener('orientationchange', () => { this.physicalCamera.setupCamera(); }, false);

                // Create a new ShaderMaterial that raytraces against a biconvex lens
                this.raytracedShaderMaterial = new THREE.ShaderMaterial( {
                    side: THREE.DoubleSide,
                    uniforms: {
                        mirrorEnabled: { value: this.simulationParams.mirrorEnabled },
                        mirrorPosition: { value: new THREE.Vector3(this.simulationParams.mirrorPosition.x, this.simulationParams.mirrorPosition.y, this.simulationParams.mirrorPosition.z) },
                        mirrorNormal: { value: new THREE.Vector3(this.simulationParams.mirrorNormal.x, this.simulationParams.mirrorNormal.y, this.simulationParams.mirrorNormal.z).normalize() },
                        mirrorRadius: { value: this.simulationParams.mirrorRadius },
                        //map                 : { value: eyeRenderTarget.texture     },
                        //envMap   : { value: this.world.scene.background },
                    },
                    vertexShader  : `
                        varying vec3 vWorldPosition;
                        void main() {
                            #include <begin_vertex>
                            #include <project_vertex>
                            vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                        }`,
                    fragmentShader: `
                        uniform samplerCube envMap;
                        uniform bool mirrorEnabled;
                        uniform vec3 mirrorPosition;
                        uniform vec3 mirrorNormal;
                        uniform float mirrorRadius;
                        varying vec3 vWorldPosition;

                        bool intersectRaySphere( vec3 ro, vec3 rd, vec4 sph, float isInside, out float t ) {
                            vec3 oc = ro - sph.xyz;
                            float b = dot(oc, rd);
                            float c = dot(oc, oc) - sph.w * sph.w;
                            float h = b * b - c;
                            if (h < 0.0) { return false; }
                            t = -b + (sqrt(h) * sign(isInside));
                            return true;
                        }
                        
                        bool intersectRayPlane( vec3 rayOrigin, vec3 rayDirection, vec3 planePoint, vec3 planeNormal, out float t ) {
                            float denom = dot(planeNormal, rayDirection);
                            if (abs(denom) < 1e-6) { return false; } // Ray is parallel to plane
                            
                            vec3 p0l0 = planePoint - rayOrigin;
                            t = dot(p0l0, planeNormal) / denom;
                            return t >= 0.0; // Only positive intersections (forward ray)
                        }
                        
                        void reflectOffSphere( inout vec3 rayOrigin, inout vec3 rayDirection, vec4 sphereParams ) {
                            float t = 0.0;
                            if ( intersectRaySphere( rayOrigin, rayDirection, sphereParams, -1.0, t ) ) {
                                rayOrigin = rayOrigin + t * rayDirection;
                                rayDirection = reflect( rayDirection, normalize( rayOrigin - sphereParams.xyz ) );
                            }
                        }
                        
                        void reflectOffPlanarMirror( inout vec3 rayOrigin, inout vec3 rayDirection, vec3 mirrorPos, vec3 mirrorNorm, float radius ) {
                            float t = 0.0;
                            if ( intersectRayPlane( rayOrigin, rayDirection, mirrorPos, mirrorNorm, t ) ) {
                                vec3 intersectionPoint = rayOrigin + t * rayDirection;
                                
                                // Check if intersection point is within the circular mirror bounds
                                float distanceFromCenter = length(intersectionPoint - mirrorPos);
                                if (distanceFromCenter <= radius) {
                                    rayOrigin = intersectionPoint;
                                    rayDirection = reflect( rayDirection, mirrorNorm );
                                }
                            }
                        }

                        void main() {
                            vec3 rayDirection = normalize(vWorldPosition - cameraPosition );
                            vec3 rayOrigin    = cameraPosition;

                            
                            // Apply planar mirror reflection if enabled
                            if (mirrorEnabled) {
                                reflectOffPlanarMirror( rayOrigin, rayDirection, mirrorPosition, mirrorNormal, mirrorRadius );
                            }

                            //reflectOffSphere( rayOrigin, rayDirection, vec4(  0.25, 0.0, 0.0, 0.25));
                            //reflectOffSphere( rayOrigin, rayDirection, vec4( -0.25, 0.0, 0.0, 0.25 ));

                            gl_FragColor = texture( envMap, rayDirection ); //vec4(rayDirection, 1.0);//

                            #include <tonemapping_fragment>
                            #include <colorspace_fragment>
                            #include <fog_fragment>
                            #include <premultiplied_alpha_fragment>
                            #include <dithering_fragment>
                        }`
                } );

                // Create a plane to render the raytraced shader material
                this.planeGeometry = new THREE.SphereGeometry( 5.5, 32, 32 );
                this.mesh = new THREE.Mesh( this.planeGeometry, this.raytracedShaderMaterial );
                this.world.scene.add( this.mesh );

			});
    }

    /** Update the mirror normal vector and normalize it */
    updateMirrorNormal() {
        if (this.raytracedShaderMaterial) {
            const normal = new THREE.Vector3(
                this.simulationParams.mirrorNormal.x,
                this.simulationParams.mirrorNormal.y,
                this.simulationParams.mirrorNormal.z
            ).normalize();
            this.raytracedShaderMaterial.uniforms.mirrorNormal.value = normal;
        }
    }

    /** Update the simulation */
    update(timeMS) {
        if(this.physicalCamera){
            this.deltaTime = timeMS - this.timeMS;
            this.timeMS = timeMS;
            this.world.controls.update();
            this.physicalCamera.render( this.deltaTime / 1000.0 );
            //this.world.renderer.render(this.world.scene, this.world.camera);
            this.world.stats.update();
        }
    }

    // Log Errors as <div>s over the main viewport
    fakeError(...args) {
        if (args.length > 0 && args[0]) { this.display(JSON.stringify(args[0])); }
        window.realConsoleError.apply(console, arguments);
    }

    display(text) {
        let errorNode = window.document.createElement("div");
        errorNode.innerHTML = text.fontcolor("red");
        window.document.getElementById("info").appendChild(errorNode);
    }
}

var main = new Main();
window.main = main;
