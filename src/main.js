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
            refractiveIndex: 1.4,
        };
        this.gui = new GUI();
        this.gui.add(this.simulationParams, 'numViews', 1, 10, 1).name('Number of Views')           .onChange((value) => { this.physicalCamera.numViews      = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'resolution', 256, 4096, 256).name('Resolution')        .onChange((value) => { this.physicalCamera.resolution    = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'aperture', 0.0, 0.1, 0.01).name('Aperture Size')       .onChange((value) => { this.physicalCamera.aperture      = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'focalDistance', 0.4, 5.0, 0.01).name('Focal Distance').onChange((value) => { this.physicalCamera.focalDistance = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'refractiveIndex', 1.0, 2.0, 0.01).name('Refractive Index').onChange((value) => { this.raytracedShaderMaterial.uniforms.refractiveIndex.value = value; });

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
                        refractiveIndex: { value: 1.4 },
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
                        uniform float refractiveIndex;
                        varying vec3 vWorldPosition;

                        bool raytraceSphere( vec3 rayOrigin, vec3 rayDirection, vec3 center, float radius, out float t ) {
                            vec3 oc = rayOrigin - center;
                            float a = dot( rayDirection, rayDirection );
                            float b = 2.0 * dot( oc, rayDirection );
                            float c = dot( oc, oc ) - radius * radius;
                            float discriminant = b * b - 4.0 * a * c;
                            if (discriminant < 0.0 ) {
                                return false;
                            } else {
                                t = (-b - sqrt( discriminant )) / (2.0 * a);
                                return t > 0.0;
                            }
                        }
                        
                        void reflectOffSphere( inout vec3 rayOrigin, inout vec3 rayDirection, vec3 center, float radius ) {
                            float t = 0.0;
                            if ( raytraceSphere( rayOrigin, rayDirection, center, radius, t ) ) {
                                rayOrigin = rayOrigin + t * rayDirection;
                                rayDirection = reflect( rayDirection, normalize( rayOrigin - center ) );
                            }
                        }

                        void refractBiconvexLens( inout vec3 rayOrigin, inout vec3 rayDirection, float refractiveIndex, vec3 c1, float r1, vec3 c2, float r2 ) {
                            float t = 0.0;
                            if ( raytraceSphere( rayOrigin, rayDirection, c1, r1, t ) ) {
                                rayOrigin = rayOrigin + t * rayDirection;
                                if( length(rayOrigin - c2) < r2 ) {
                                    vec3 normal = normalize( rayOrigin - c1 );
                                    vec3 refractedRay = refract( rayDirection, normal, 1.0 / refractiveIndex );
                                    if ( refractedRay != vec3(0.0) ) {
                                        rayDirection = refractedRay;
                                        if ( raytraceSphere( rayOrigin, rayDirection, c2, r2, t ) ) {
                                            rayOrigin = rayOrigin + t * rayDirection;
                                            normal = normalize( rayOrigin - c2 );
                                            refractedRay = refract( rayDirection, normal, refractiveIndex / 1.0 );
                                            if ( refractedRay != vec3(0.0) ) {
                                                rayDirection = refractedRay;
                                            }
                                        }
                                    }
                                }
                            }

                            if ( raytraceSphere( rayOrigin, rayDirection, c2, r2, t ) ) {
                                rayOrigin = rayOrigin + t * rayDirection;
                                if( length(rayOrigin - c1) < r1 ) {
                                    vec3 normal = normalize( rayOrigin - c2 );
                                    vec3 refractedRay = refract( rayDirection, normal, 1.0 / refractiveIndex );
                                    if ( refractedRay != vec3(0.0) ) {
                                        rayDirection = refractedRay;
                                        if ( raytraceSphere( rayOrigin, rayDirection, c1, r1, t ) ) {
                                            rayOrigin = rayOrigin + t * rayDirection;
                                            normal = normalize( rayOrigin - c1 );
                                            refractedRay = refract( rayDirection, normal, refractiveIndex / 1.0 );
                                            if ( refractedRay != vec3(0.0) ) {
                                                rayDirection = refractedRay;
                                            }
                                        }
                                    }
                                }
                            }

                        }

                        void main() {
                            vec3 rayDirection = normalize(vWorldPosition - cameraPosition );
                            vec3 rayOrigin    = cameraPosition;

                            //reflectOffSphere( rayOrigin, rayDirection, vec3(  0.25, 0.0, 0.0 ), 0.25);
                            //reflectOffSphere( rayOrigin, rayDirection, vec3( -0.25, 0.0, 0.0 ), 0.25);
                            refractBiconvexLens( rayOrigin, rayDirection, refractiveIndex, vec3( 0.4, 0.0, 0.0 ), 0.5, vec3( -0.4, 0.0, 0.0 ), 0.5 );

                            gl_FragColor = texture( envMap, rayDirection );

                            #include <tonemapping_fragment>
                            #include <colorspace_fragment>
                            #include <fog_fragment>
                            #include <premultiplied_alpha_fragment>
                            #include <dithering_fragment>
                        }`
                } );

                // Create a plane to render the raytraced shader material
                this.planeGeometry = new THREE.SphereGeometry( 0.5, 32, 32 );
                this.mesh = new THREE.Mesh( this.planeGeometry, this.raytracedShaderMaterial );
                this.world.scene.add( this.mesh );

			});
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
