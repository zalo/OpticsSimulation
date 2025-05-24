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
            focus1X: -1.5,
            focus1Y: 0.0,
            focus1Z: 0.0,
            focus2X: -0.5,
            focus2Y: 0.0,
            focus2Z: 0.0,
            minorRadius: 0.3,
            ellipsoidInside: false,
        };
        this.gui = new GUI();
        this.gui.add(this.simulationParams, 'numViews', 1, 10, 1).name('Number of Views')           .onChange((value) => { this.physicalCamera.numViews      = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'resolution', 256, 4096, 256).name('Resolution')        .onChange((value) => { this.physicalCamera.resolution    = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'aperture', 0.0, 0.1, 0.01).name('Aperture Size')       .onChange((value) => { this.physicalCamera.aperture      = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'focalDistance', 0.4, 5.0, 0.01).name('Focal Distance').onChange((value) => { this.physicalCamera.focalDistance = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'refractiveIndex', 1.0, 2.0, 0.01).name('Refractive Index').onChange((value) => { this.raytracedShaderMaterial.uniforms.refractiveIndex.value = value; });
        
        const ellipsoidFolder = this.gui.addFolder('Ellipsoidal Mirror');
        ellipsoidFolder.add(this.simulationParams, 'focus1X', -3.0, 3.0, 0.01).name('Focus 1 X').onChange((value) => { this.raytracedShaderMaterial.uniforms.focus1X.value = value; });
        ellipsoidFolder.add(this.simulationParams, 'focus1Y', -3.0, 3.0, 0.01).name('Focus 1 Y').onChange((value) => { this.raytracedShaderMaterial.uniforms.focus1Y.value = value; });
        ellipsoidFolder.add(this.simulationParams, 'focus1Z', -3.0, 3.0, 0.01).name('Focus 1 Z').onChange((value) => { this.raytracedShaderMaterial.uniforms.focus1Z.value = value; });
        ellipsoidFolder.add(this.simulationParams, 'focus2X', -3.0, 3.0, 0.01).name('Focus 2 X').onChange((value) => { this.raytracedShaderMaterial.uniforms.focus2X.value = value; });
        ellipsoidFolder.add(this.simulationParams, 'focus2Y', -3.0, 3.0, 0.01).name('Focus 2 Y').onChange((value) => { this.raytracedShaderMaterial.uniforms.focus2Y.value = value; });
        ellipsoidFolder.add(this.simulationParams, 'focus2Z', -3.0, 3.0, 0.01).name('Focus 2 Z').onChange((value) => { this.raytracedShaderMaterial.uniforms.focus2Z.value = value; });
        ellipsoidFolder.add(this.simulationParams, 'minorRadius', 0.1, 2.0, 0.01).name('Minor Radius').onChange((value) => { this.raytracedShaderMaterial.uniforms.minorRadius.value = value; });
        ellipsoidFolder.add(this.simulationParams, 'ellipsoidInside').name('Inside Surface').onChange((value) => { this.raytracedShaderMaterial.uniforms.ellipsoidInside.value = value; });

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
                        focus1X: { value: this.simulationParams.focus1X },
                        focus1Y: { value: this.simulationParams.focus1Y },
                        focus1Z: { value: this.simulationParams.focus1Z },
                        focus2X: { value: this.simulationParams.focus2X },
                        focus2Y: { value: this.simulationParams.focus2Y },
                        focus2Z: { value: this.simulationParams.focus2Z },
                        minorRadius: { value: this.simulationParams.minorRadius },
                        ellipsoidInside: { value: this.simulationParams.ellipsoidInside },
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
                        uniform float focus1X;
                        uniform float focus1Y;
                        uniform float focus1Z;
                        uniform float focus2X;
                        uniform float focus2Y;
                        uniform float focus2Z;
                        uniform float minorRadius;
                        uniform bool ellipsoidInside;
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
                        
                        void reflectOffSphere( inout vec3 rayOrigin, inout vec3 rayDirection, vec4 sphereParams ) {
                            float t = 0.0;
                            if ( intersectRaySphere( rayOrigin, rayDirection, sphereParams, -1.0, t ) ) {
                                rayOrigin = rayOrigin + t * rayDirection;
                                rayDirection = reflect( rayDirection, normalize( rayOrigin - sphereParams.xyz ) );
                            }
                        }

                        bool intersectRayEllipsoid( vec3 ro, vec3 rd, vec3 focus1, vec3 focus2, float minorRadius, bool isInside, out float t, out vec3 normal ) {
                            vec3 center = (focus1 + focus2) * 0.5;
                            vec3 focalAxis = focus2 - focus1;
                            float focalDistance = length(focalAxis);
                            
                            if (focalDistance < 1e-6) { return false; }
                            
                            vec3 focalDir = focalAxis / focalDistance;
                            float c = focalDistance * 0.5;
                            float b = minorRadius;
                            float a = sqrt(c * c + b * b);
                            
                            vec3 u = focalDir;
                            vec3 v = abs(u.z) < 0.9 ? normalize(cross(u, vec3(0, 0, 1))) : normalize(cross(u, vec3(1, 0, 0)));
                            vec3 w = cross(u, v);
                            
                            vec3 localRo = ro - center;
                            vec3 localRoRot = vec3(dot(localRo, u), dot(localRo, v), dot(localRo, w));
                            vec3 localRdRot = vec3(dot(rd, u), dot(rd, v), dot(rd, w));
                            
                            float a2 = a * a;
                            float b2 = b * b;
                            
                            float A = (localRdRot.x * localRdRot.x) / a2 + (localRdRot.y * localRdRot.y) / b2 + (localRdRot.z * localRdRot.z) / b2;
                            float B = 2.0 * ((localRoRot.x * localRdRot.x) / a2 + (localRoRot.y * localRdRot.y) / b2 + (localRoRot.z * localRdRot.z) / b2);
                            float C = (localRoRot.x * localRoRot.x) / a2 + (localRoRot.y * localRoRot.y) / b2 + (localRoRot.z * localRoRot.z) / b2 - 1.0;
                            
                            float discriminant = B * B - 4.0 * A * C;
                            if (discriminant < 0.0) { return false; }
                            
                            float sqrtD = sqrt(discriminant);
                            float t1 = (-B - sqrtD) / (2.0 * A);
                            float t2 = (-B + sqrtD) / (2.0 * A);
                            
                            if (isInside) {
                                t = (t2 > 0.0) ? t2 : t1;
                            } else {
                                t = (t1 > 0.0) ? t1 : t2;
                            }
                            
                            if (t <= 0.0) { return false; }
                            
                            vec3 intersection = ro + t * rd;
                            vec3 localIntersection = intersection - center;
                            vec3 localIntRot = vec3(dot(localIntersection, u), dot(localIntersection, v), dot(localIntersection, w));
                            
                            vec3 localNormal = normalize(vec3(
                                2.0 * localIntRot.x / a2,
                                2.0 * localIntRot.y / b2,
                                2.0 * localIntRot.z / b2
                            ));
                            
                            normal = normalize(localNormal.x * u + localNormal.y * v + localNormal.z * w);
                            
                            if (isInside) {
                                normal = -normal;
                            }
                            
                            return true;
                        }

                        void reflectOffEllipsoid( inout vec3 rayOrigin, inout vec3 rayDirection, vec3 focus1, vec3 focus2, float minorRadius, bool isInside ) {
                            float t = 0.0;
                            vec3 normal = vec3(0.0);
                            if ( intersectRayEllipsoid( rayOrigin, rayDirection, focus1, focus2, minorRadius, isInside, t, normal ) ) {
                                rayOrigin = rayOrigin + t * rayDirection;
                                rayDirection = reflect( rayDirection, normal );
                            }
                        }

                        void refractBiconvexLens( inout vec3 rayOrigin, inout vec3 rayDirection, float refractiveIndex, vec3 c1, float r1, vec3 c2, float r2 ) {
                            float t = 0.0;
                            if ( intersectRaySphere( rayOrigin, rayDirection, vec4(c1, r1), -1.0, t ) ) {
                                vec3 intersection = rayOrigin + t * rayDirection;
                                if( length(intersection - c2) < r2 ) {
                                    rayOrigin = intersection;
                                    vec3 normal = normalize( rayOrigin - c1 );
                                    vec3 refractedRay = refract( rayDirection, normal, 1.0 / refractiveIndex );
                                    if ( refractedRay != vec3(0.0) ) {
                                        rayDirection = refractedRay;
                                        if ( intersectRaySphere( rayOrigin, rayDirection, vec4(c2, r2), 1.0, t ) ) {
                                            rayOrigin = rayOrigin + t * rayDirection;
                                            normal = -normalize( rayOrigin - c2 );
                                            refractedRay = refract( rayDirection, normal, refractiveIndex / 1.0 );
                                            if ( refractedRay != vec3(0.0) ) {
                                                rayDirection = refractedRay;
                                            }
                                        }
                                    }
                                } else if ( intersectRaySphere( rayOrigin, rayDirection, vec4(c2, r2), -1.0, t ) ) {
                                    vec3 intersection = rayOrigin + t * rayDirection;
                                    if( length(intersection - c1) < r1 ) {
                                        rayOrigin = intersection;
                                        vec3 normal = normalize( rayOrigin - c2 );
                                        vec3 refractedRay = refract( rayDirection, normal, 1.0 / refractiveIndex );
                                        if ( refractedRay != vec3(0.0) ) {
                                            rayDirection = refractedRay;
                                            if ( intersectRaySphere( rayOrigin, rayDirection, vec4(c1, r1), 1.0, t ) ) {
                                                rayOrigin = rayOrigin + t * rayDirection;
                                                normal = -normalize( rayOrigin - c1 );
                                                refractedRay = refract( rayDirection, normal, refractiveIndex / 1.0 );
                                                if ( refractedRay != vec3(0.0) ) {
                                                    rayDirection = refractedRay;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        void main() {
                            vec3 rayDirection = normalize(vWorldPosition - cameraPosition );
                            vec3 rayOrigin    = cameraPosition;

                            //reflectOffSphere( rayOrigin, rayDirection, vec4(  0.25, 0.0, 0.0, 0.25);
                            //reflectOffSphere( rayOrigin, rayDirection, vec4( -0.25, 0.0, 0.0, 0.25 ));
                            refractBiconvexLens( rayOrigin, rayDirection, refractiveIndex, vec3( 0.4, 0.0, 0.0 ), 0.5, vec3( -0.4, 0.0, 0.0 ), 0.5 );
                            
                            reflectOffEllipsoid( rayOrigin, rayDirection, vec3( focus1X, focus1Y, focus1Z ), vec3( focus2X, focus2Y, focus2Z ), minorRadius, ellipsoidInside );

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
