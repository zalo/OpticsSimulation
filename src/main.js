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
            focalDistance: 1.27,
            parabola1: {
                position: { x: 0.0, y: 0.4, z: 0.0 },
                normal: { x: -1.0, y: -1.0, z: 0.0 },
                extrusionDirection: { x: 1.0, y: -1.0, z: 0.0 },
                focalDistance: -0.9,
                width: 0.2,
                height: 0.25
            },
            parabola2: {
                position: { x: 0.0, y: 0.8, z: 0.0 },
                normal: { x: 1.0, y: 1.0, z: 0.0 },
                extrusionDirection: { x: 0.0, y: 0.0, z: 1.0 },
                focalDistance: -0.8,
                width: 0.5,
                height: 0.25
            }
        };
        this.gui = new GUI();
        this.gui.add(this.simulationParams, 'numViews', 1, 10, 1).name('Number of Views')           .onChange((value) => { this.physicalCamera.numViews      = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'resolution', 256, 4096, 256).name('Resolution')        .onChange((value) => { this.physicalCamera.resolution    = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'aperture', 0.0, 0.1, 0.01).name('Aperture Size')       .onChange((value) => { this.physicalCamera.aperture      = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'focalDistance', 0.4, 5.0, 0.01).name('Focal Distance').onChange((value) => { this.physicalCamera.focalDistance = value; this.physicalCamera.setupCamera(); });
        
        // Parabola controls
        const parabola1Folder = this.gui.addFolder('Parabola 1');
        parabola1Folder.add(this.simulationParams.parabola1.position, 'x', -2.0, 2.0, 0.1).name('Position X').onChange(() => this.updateParabolaUniforms());
        parabola1Folder.add(this.simulationParams.parabola1.position, 'y', -2.0, 2.0, 0.1).name('Position Y').onChange(() => this.updateParabolaUniforms());
        parabola1Folder.add(this.simulationParams.parabola1.position, 'z', -2.0, 2.0, 0.1).name('Position Z').onChange(() => this.updateParabolaUniforms());
        parabola1Folder.add(this.simulationParams.parabola1.normal, 'x', -1.0, 1.0, 0.1).name('Normal X').onChange(() => this.updateParabolaUniforms());
        parabola1Folder.add(this.simulationParams.parabola1.normal, 'y', -1.0, 1.0, 0.1).name('Normal Y').onChange(() => this.updateParabolaUniforms());
        parabola1Folder.add(this.simulationParams.parabola1.normal, 'z', -1.0, 1.0, 0.1).name('Normal Z').onChange(() => this.updateParabolaUniforms());
        parabola1Folder.add(this.simulationParams.parabola1.extrusionDirection, 'x', -1.0, 1.0, 0.1).name('Extrusion X').onChange(() => this.updateParabolaUniforms());
        parabola1Folder.add(this.simulationParams.parabola1.extrusionDirection, 'y', -1.0, 1.0, 0.1).name('Extrusion Y').onChange(() => this.updateParabolaUniforms());
        parabola1Folder.add(this.simulationParams.parabola1.extrusionDirection, 'z', -1.0, 1.0, 0.1).name('Extrusion Z').onChange(() => this.updateParabolaUniforms());
        parabola1Folder.add(this.simulationParams.parabola1, 'focalDistance', -3.0, 3.0, 0.1).name('Focal Distance').onChange(() => this.updateParabolaUniforms());
        parabola1Folder.add(this.simulationParams.parabola1, 'width', 0.1, 2.0, 0.1).name('Width').onChange(() => this.updateParabolaUniforms());
        parabola1Folder.add(this.simulationParams.parabola1, 'height', 0.1, 2.0, 0.1).name('Height').onChange(() => this.updateParabolaUniforms());
        
        const parabola2Folder = this.gui.addFolder('Parabola 2');
        parabola2Folder.add(this.simulationParams.parabola2.position, 'x', -2.0, 2.0, 0.1).name('Position X').onChange(() => this.updateParabolaUniforms());
        parabola2Folder.add(this.simulationParams.parabola2.position, 'y', -2.0, 2.0, 0.1).name('Position Y').onChange(() => this.updateParabolaUniforms());
        parabola2Folder.add(this.simulationParams.parabola2.position, 'z', -2.0, 2.0, 0.1).name('Position Z').onChange(() => this.updateParabolaUniforms());
        parabola2Folder.add(this.simulationParams.parabola2.normal, 'x', -1.0, 1.0, 0.1).name('Normal X').onChange(() => this.updateParabolaUniforms());
        parabola2Folder.add(this.simulationParams.parabola2.normal, 'y', -1.0, 1.0, 0.1).name('Normal Y').onChange(() => this.updateParabolaUniforms());
        parabola2Folder.add(this.simulationParams.parabola2.normal, 'z', -1.0, 1.0, 0.1).name('Normal Z').onChange(() => this.updateParabolaUniforms());
        parabola2Folder.add(this.simulationParams.parabola2.extrusionDirection, 'x', -1.0, 1.0, 0.1).name('Extrusion X').onChange(() => this.updateParabolaUniforms());
        parabola2Folder.add(this.simulationParams.parabola2.extrusionDirection, 'y', -1.0, 1.0, 0.1).name('Extrusion Y').onChange(() => this.updateParabolaUniforms());
        parabola2Folder.add(this.simulationParams.parabola2.extrusionDirection, 'z', -1.0, 1.0, 0.1).name('Extrusion Z').onChange(() => this.updateParabolaUniforms());
        parabola2Folder.add(this.simulationParams.parabola2, 'focalDistance', -3.0, 3.0, 0.1).name('Focal Distance').onChange(() => this.updateParabolaUniforms());
        parabola2Folder.add(this.simulationParams.parabola2, 'width', 0.1, 2.0, 0.1).name('Width').onChange(() => this.updateParabolaUniforms());
        parabola2Folder.add(this.simulationParams.parabola2, 'height', 0.1, 2.0, 0.1).name('Height').onChange(() => this.updateParabolaUniforms());

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
                        //map                 : { value: eyeRenderTarget.texture     },
                        //envMap   : { value: this.world.scene.background },
                        parabola1Position: { value: new THREE.Vector3(0.0, 0.4, 0.0) },
                        parabola1Normal: { value: new THREE.Vector3(1.0, 1.0, 0.0).normalize() },
                        parabola1ExtrusionDirection: { value: new THREE.Vector3(0.0, 0.0, 1.0) },
                        parabola1FocalDistance: { value: 0.5 },
                        parabola1Width: { value: 0.5 },
                        parabola1Height: { value: 0.25 },
                        parabola2Position: { value: new THREE.Vector3(0.0, 0.8, 0.0) },
                        parabola2Normal: { value: new THREE.Vector3(1.0, 1.0, 0.0).normalize() },
                        parabola2ExtrusionDirection: { value: new THREE.Vector3(0.0, 0.0, 1.0) },
                        parabola2FocalDistance: { value: 0.5 },
                        parabola2Width: { value: 0.5 },
                        parabola2Height: { value: 0.25 },
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
                        uniform vec3 parabola1Position;
                        uniform vec3 parabola1Normal;
                        uniform vec3 parabola1ExtrusionDirection;
                        uniform float parabola1FocalDistance;
                        uniform float parabola1Width;
                        uniform float parabola1Height;
                        uniform vec3 parabola2Position;
                        uniform vec3 parabola2Normal;
                        uniform vec3 parabola2ExtrusionDirection;
                        uniform float parabola2FocalDistance;
                        uniform float parabola2Width;
                        uniform float parabola2Height;
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
                        
                        bool intersectRayLinearParabola( vec3 rayOrigin, vec3 rayDirection, vec3 parabolaPos, vec3 parabolaNormal, vec3 extrusionDir, float focalDistance, float width, float height, out float t, out vec3 surfaceNormal ) {
                            // Create coordinate system for linear parabola
                            // w = parabola axis (direction of parabolic curve)
                            // u = direction of parabolic variation  
                            // v = extrusion direction (linear)
                            vec3 w = normalize(parabolaNormal);
                            vec3 v = normalize(extrusionDir - dot(extrusionDir, w) * w); // Make perpendicular to w
                            vec3 u = cross(v, w); // Complete right-handed system
                            
                            // Transform ray to parabola's local coordinate system
                            vec3 localOrigin = rayOrigin - parabolaPos;
                            vec3 localRayOrigin = vec3(dot(localOrigin, u), dot(localOrigin, v), dot(localOrigin, w));
                            vec3 localRayDirection = vec3(dot(rayDirection, u), dot(rayDirection, v), dot(rayDirection, w));
                            
                            // Linear parabola equation: z = x^2 / (4 * focalDistance), extruded in y direction
                            // Ray equation: P = O + t * D
                            // Substituting: O.z + t * D.z = (O.x + t * D.x)^2 / (4 * f)
                            
                            float a = (localRayDirection.x * localRayDirection.x) / (4.0 * focalDistance);
                            float b = (2.0 * localRayOrigin.x * localRayDirection.x) / (4.0 * focalDistance) - localRayDirection.z;
                            float c = (localRayOrigin.x * localRayOrigin.x) / (4.0 * focalDistance) - localRayOrigin.z;
                            
                            float discriminant = b * b - 4.0 * a * c;
                            if (discriminant < 0.0) return false;
                            
                            float sqrtDisc = sqrt(discriminant);
                            float t1 = (-b - sqrtDisc) / (2.0 * a);
                            float t2 = (-b + sqrtDisc) / (2.0 * a);
                            
                            // Choose the closest positive intersection
                            t = (t1 > 0.0) ? t1 : t2;
                            if (t <= 0.0) return false;
                            
                            // Check if intersection is within the rectangular bounds
                            vec3 localHitPoint = localRayOrigin + t * localRayDirection;
                            if (abs(localHitPoint.x) > width * 0.5 || abs(localHitPoint.y) > height * 0.5) return false;
                            
                            // Calculate surface normal at intersection point
                            // For z = x^2/(4f), gradient is (x/(2f), 0, -1)
                            vec3 localNormal = normalize(vec3(
                                localHitPoint.x / (2.0 * focalDistance),
                                0.0,
                                -1.0
                            ));
                            
                            // Transform normal back to world space
                            surfaceNormal = normalize(localNormal.x * u + localNormal.y * v + localNormal.z * w);
                            
                            return true;
                        }
                        
                        void reflectOffLinearParabolicMirror( inout vec3 rayOrigin, inout vec3 rayDirection, vec3 parabolaPos, vec3 parabolaNormal, vec3 extrusionDir, float focalDistance, float width, float height ) {
                            float t = 0.0;
                            vec3 surfaceNormal = vec3(0.0);
                            if ( intersectRayLinearParabola( rayOrigin, rayDirection, parabolaPos, parabolaNormal, extrusionDir, focalDistance, width, height, t, surfaceNormal ) ) {
                                rayOrigin = rayOrigin + t * rayDirection;
                                rayDirection = reflect( rayDirection, surfaceNormal );
                            }
                        }
                        
                        mat3 rotationMatrix(vec3 euler) {
                            float cx = cos(euler.x);
                            float sx = sin(euler.x);
                            float cy = cos(euler.y);
                            float sy = sin(euler.y);
                            float cz = cos(euler.z);
                            float sz = sin(euler.z);
                            
                            mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, cx, -sx, 0.0, sx, cx);
                            mat3 rotY = mat3(cy, 0.0, sy, 0.0, 1.0, 0.0, -sy, 0.0, cy);
                            mat3 rotZ = mat3(cz, -sz, 0.0, sz, cz, 0.0, 0.0, 0.0, 1.0);
                            
                            return rotZ * rotY * rotX;
                        }
                        
                        bool intersectRayQuad( vec3 rayOrigin, vec3 rayDirection, vec3 quadPos, vec3 quadRot, vec2 quadSize, out float t, out vec3 hitColor ) {
                            mat3 rotation = rotationMatrix(quadRot);
                            vec3 quadNormal = rotation * vec3(0.0, 0.0, 1.0);
                            
                            // Intersect with the plane containing the quad
                            if (!intersectRayPlane(rayOrigin, rayDirection, quadPos, quadNormal, t)) {
                                return false;
                            }
                            
                            vec3 intersectionPoint = rayOrigin + t * rayDirection;
                            vec3 localPoint = intersectionPoint - quadPos;
                            
                            // Transform to quad's local coordinate system
                            vec3 localU = rotation * vec3(1.0, 0.0, 0.0);
                            vec3 localV = rotation * vec3(0.0, 1.0, 0.0);
                            
                            float u = dot(localPoint, localU);
                            float v = dot(localPoint, localV);
                            
                            // Check if intersection is within quad bounds
                            if (abs(u) <= quadSize.x * 0.5 && abs(v) <= quadSize.y * 0.5) {
                                // Create a simple checkerboard pattern
                                float checkerSize = 0.01;
                                float checkU = floor((u + quadSize.x * 0.5) / checkerSize);
                                float checkV = floor((v + quadSize.y * 0.5) / checkerSize);
                                float checker = mod(checkU + checkV, 2.0);
                                hitColor = mix(vec3(0.8, 0.2, 0.2), vec3(0.2, 0.8, 0.2), checker);
                                return true;
                            }
                            
                            return false;
                        }

                        void main() {
                            vec3 rayDirection = normalize(vWorldPosition - cameraPosition );
                            vec3 rayOrigin    = cameraPosition;
                        
                            // Reflect off of the two linear parabolic mirrors
                            reflectOffLinearParabolicMirror( rayOrigin, rayDirection, parabola1Position, parabola1Normal, parabola1ExtrusionDirection, parabola1FocalDistance, parabola1Width, parabola1Height );
                            reflectOffLinearParabolicMirror( rayOrigin, rayDirection, parabola2Position, parabola2Normal, parabola2ExtrusionDirection, parabola2FocalDistance, parabola2Width, parabola2Height );

                            // Check for intersection with the image quad
                            float quadT = 0.0;
                            vec3 quadColor = vec3(0.0);
                            if (intersectRayQuad(rayOrigin, rayDirection, vec3(-0.4, 0.8, 0.0), vec3(0.0, 3.14159*0.5, 0.0), vec2(0.4, 0.4), quadT, quadColor)) {
                                gl_FragColor = vec4(quadColor, 1.0);
                            } else {
                                // Otherwise just cast the ray into the background
                                gl_FragColor = texture( envMap, rayDirection );
                            }

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

    /** Update the parabola uniforms */
    updateParabolaUniforms() {
        if (this.raytracedShaderMaterial) {
            // Update parabola 1
            this.raytracedShaderMaterial.uniforms.parabola1Position.value.set(
                this.simulationParams.parabola1.position.x,
                this.simulationParams.parabola1.position.y,
                this.simulationParams.parabola1.position.z
            );
            const normal1 = new THREE.Vector3(
                this.simulationParams.parabola1.normal.x,
                this.simulationParams.parabola1.normal.y,
                this.simulationParams.parabola1.normal.z
            ).normalize();
            this.raytracedShaderMaterial.uniforms.parabola1Normal.value.copy(normal1);
            const extrusionDir1 = new THREE.Vector3(
                this.simulationParams.parabola1.extrusionDirection.x,
                this.simulationParams.parabola1.extrusionDirection.y,
                this.simulationParams.parabola1.extrusionDirection.z
            ).normalize();
            this.raytracedShaderMaterial.uniforms.parabola1ExtrusionDirection.value.copy(extrusionDir1);
            this.raytracedShaderMaterial.uniforms.parabola1FocalDistance.value = this.simulationParams.parabola1.focalDistance;
            this.raytracedShaderMaterial.uniforms.parabola1Width.value = this.simulationParams.parabola1.width;
            this.raytracedShaderMaterial.uniforms.parabola1Height.value = this.simulationParams.parabola1.height;
            
            // Update parabola 2
            this.raytracedShaderMaterial.uniforms.parabola2Position.value.set(
                this.simulationParams.parabola2.position.x,
                this.simulationParams.parabola2.position.y,
                this.simulationParams.parabola2.position.z
            );
            const normal2 = new THREE.Vector3(
                this.simulationParams.parabola2.normal.x,
                this.simulationParams.parabola2.normal.y,
                this.simulationParams.parabola2.normal.z
            ).normalize();
            this.raytracedShaderMaterial.uniforms.parabola2Normal.value.copy(normal2);
            const extrusionDir2 = new THREE.Vector3(
                this.simulationParams.parabola2.extrusionDirection.x,
                this.simulationParams.parabola2.extrusionDirection.y,
                this.simulationParams.parabola2.extrusionDirection.z
            ).normalize();
            this.raytracedShaderMaterial.uniforms.parabola2ExtrusionDirection.value.copy(extrusionDir2);
            this.raytracedShaderMaterial.uniforms.parabola2FocalDistance.value = this.simulationParams.parabola2.focalDistance;
            this.raytracedShaderMaterial.uniforms.parabola2Width.value = this.simulationParams.parabola2.width;
            this.raytracedShaderMaterial.uniforms.parabola2Height.value = this.simulationParams.parabola2.height;
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
