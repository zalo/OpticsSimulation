import * as THREE from '../node_modules/three/build/three.module.js';
import { GUI } from '../node_modules/three/examples/jsm/libs/lil-gui.module.min.js';
import World from './World.js';
import { TransformControls } from '../node_modules/three/examples/jsm/controls/TransformControls.js';
import PhysicalDoFCamera from './PhysicalDoFCamera.js';
import { RGBELoader } from '../node_modules/three/examples/jsm/loaders/RGBELoader.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '../node_modules/three/examples/jsm/loaders/DRACOLoader.js';
import { mergeVertices, toCreasedNormals } from '../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { Line2 } from '../node_modules/three/examples/jsm/lines/Line2.js';
import { LineMaterial } from '../node_modules/three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from '../node_modules/three/examples/jsm/lines/LineGeometry.js';

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
            numViews: 1,
            resolution: 4096,
            aperture: 0.01,
            focalDistance: 0.65
        };
        this.gui = new GUI();
        this.gui.add(this.simulationParams, 'numViews', 1, 10, 1).name('Number of Views')          .onChange((value) => { this.physicalCamera.numViews      = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'resolution', 256, 4096, 256).name('Resolution')       .onChange((value) => { this.physicalCamera.resolution    = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'aperture', 0.0, 0.1, 0.01).name('Aperture Size')      .onChange((value) => { this.physicalCamera.aperture      = value; this.physicalCamera.setupCamera(); });
        this.gui.add(this.simulationParams, 'focalDistance', 0.4, 5.0, 0.01).name('Focal Distance').onChange((value) => { this.physicalCamera.focalDistance = value; this.physicalCamera.setupCamera(); });

        // Construct the render world
        this.world = new World(this);

        this.objectScene = new THREE.Scene();
        this.objectCamera = new THREE.OrthographicCamera( -0.6, 0.6, 0.6, -0.6, 0.01, 100 );
        this.objectCamera.position.set( 0.0, 3, 0.0 );
        this.objectCamera.lookAt(0, 0, 0);
        this.objectCamera.layers.enableAll();
        this.objectScene.add(this.objectCamera);
        this.rtTexture = new THREE.WebGLRenderTarget( 2048, 2048, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat } );
        this.spotLight = new THREE.SpotLight( 0xffffff, Math.PI * 10.0 );
        this.spotLight.angle = Math.PI / 5;
        this.spotLight.penumbra = 0.2;
        this.spotLight.position.set( -2, 3, -3 );
        this.objectScene.add( this.spotLight );
        this.dirLight = new THREE.DirectionalLight( 0x55505a, Math.PI * 10.0 );
        this.dirLight.position.set( 0, 3, 0 );
        this.objectScene.add( this.dirLight );
        this.hemiLight = new THREE.HemisphereLight( 0xffffff, 0x444444 );
        this.hemiLight.position.set( 0, 20, 0 );
        this.objectScene.add( this.hemiLight );
        
        // Draw the slit line segment
        let points = [new THREE.Vector3(0, 0, 0.75), new THREE.Vector3(0, 0.25, 0.75)];
        let geometry = new LineGeometry().setPositions(points.flatMap(p => [p.x, p.y, p.z]));
        let material = new LineMaterial( { color: 0xffff00, linewidth: 5 } );
        this.slitLine = new Line2( geometry, material );
        this.world.scene.add( this.slitLine );
        this.slitLine.computeLineDistances();
        this.slitLine.scale.set(1, 1, 1);
        this.slitLine.frustumCulled = false
        this.meshes = [];

        // Load the GLTF model
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath('./node_modules/three/examples/jsm/libs/draco/');
        this.dracoLoader.setDecoderConfig({ type: 'js' });
        this.loader = new GLTFLoader();
        this.loader.setDRACOLoader(this.dracoLoader);
        this.loader.load('./assets/duck.glb', (gltf) => {
            this.mesh = gltf.scene.children[0];
            this.mesh.position.set(0, 0.05, 0);
            this.mesh.scale.set(0.9, 0.9, 0.9);
            this.objectScene.add(this.mesh);
            this.mesh.frustumCulled = false

            this.mesh.material.side = THREE.BackSide;
            this.mesh.material.uniforms = { slitAngle : { value: this.slitAngle } };
            this.mesh.material.onBeforeCompile = (shader) => {
                this.patchObjectShader(shader);
                shader.uniforms.slitAngle = this.mesh.material.uniforms.slitAngle;
                this.mesh.material.userData.shader = shader;
            };
            this.meshes.push(this.mesh);

            for(let i = 0; i < 14; i++){
                let mesh2 = this.mesh.clone();
                mesh2.material = this.mesh.material.clone();
                mesh2.material.uniforms = { slitAngle : { value: this.slitAngle + Math.PI } };
                mesh2.material.onBeforeCompile = (shader) => {
                    this.patchObjectShader(shader);
                    shader.uniforms.slitAngle = mesh2.material.uniforms.slitAngle;
                    mesh2.material.userData.shader = shader;
                };
                this.objectScene.add(mesh2);
                this.meshes.push(mesh2);
            }
        });

		new RGBELoader()
			.setPath('assets/')
			.load('quarry_01_1k.hdr', (texture) => {
				texture.mapping = THREE.EquirectangularReflectionMapping;
				this.world.scene.background = texture;
				this.world.scene.environment = texture;

                this.physicalCamera = new PhysicalDoFCamera(this.world.renderer, this.world.scene, this.world.camera);
                window.addEventListener(           'resize', () => { this.physicalCamera.setupCamera(); }, false);
                window.addEventListener('orientationchange', () => { this.physicalCamera.setupCamera(); }, false);
                this.physicalCamera.numViews      = this.simulationParams.numViews     ;
                this.physicalCamera.resolution    = this.simulationParams.resolution   ;
                this.physicalCamera.aperture      = this.simulationParams.aperture     ;
                this.physicalCamera.focalDistance = this.simulationParams.focalDistance;
                this.physicalCamera.setupCamera();

                // Create a new ShaderMaterial that raytraces against a biconvex lens
                this.raytracedShaderMaterial = new THREE.ShaderMaterial( {
                    side: THREE.DoubleSide,
                    uniforms: {
                        //envMap   : { value: this.world.scene.background },
                        map      : { value: this.rtTexture.texture      }
                    },
                    vertexShader  : `
                        varying vec3 vWorldPosition;
                        void main() {
                            #include <begin_vertex>
                            #include <project_vertex>
                            vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                        }`,
                    fragmentShader: `
                        uniform sampler2D map;
                        //uniform samplerCube envMap;
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
                        
                        float dot2( in vec3 v ) { return dot(v,v); }

                        vec4 iCappedCone( in vec3  ro, in vec3  rd, 
                                        in vec3  pa, in vec3  pb, 
                                        in float ra, in float rb, 
                                        in bool frontSurface ) {
                            vec3  ba = pb - pa;
                            vec3  oa = ro - pa;
                            vec3  ob = ro - pb;
                            
                            float m0 = dot(ba,ba);
                            float m1 = dot(oa,ba);
                            float m2 = dot(ob,ba); 
                            float m3 = dot(rd,ba);

                            ////caps
                            //    if( m1<0.0 ) { if( dot2(oa*m3-rd*m1)<(ra*ra*m3*m3) ) return vec4(-m1/m3,-ba*inversesqrt(m0)); }
                            //else if( m2>0.0 ) { if( dot2(ob*m3-rd*m2)<(rb*rb*m3*m3) ) return vec4(-m2/m3, ba*inversesqrt(m0)); }
                            
                            // body
                            float m4 = dot(rd,oa);
                            float m5 = dot(oa,oa);
                            float rr = ra - rb;
                            float hy = m0 + rr*rr;
                            
                            float k2 = m0*m0    - m3*m3*hy;
                            float k1 = m0*m0*m4 - m1*m3*hy + m0*ra*(rr*m3*1.0        );
                            float k0 = m0*m0*m5 - m1*m1*hy + m0*ra*(rr*m1*2.0 - m0*ra);
                            
                            float h = k1*k1 - k2*k0;
                            if( h<0.0 ) return vec4(-1.0);

                            float t1 = (-k1-sqrt(h))/k2;
                            float t2 = (-k1+sqrt(h))/k2;
                            
                            float t = frontSurface ? t1 : t2;
                            
                            // Check if t is valid and within cone bounds
                            if( t > 0.0 ) {
                                float y = m1 + t*m3;
                                if( y>0.0 && y<m0 ) 
                                {
                                    vec3 normal = normalize(m0*(m0*(oa+t*rd)+rr*ba*ra)-ba*hy*y);
                                    return vec4(t, frontSurface ? normal : -normal);
                                }
                            }
                            
                            return vec4(-1.0);
                        }

                        void reflectOffCone( inout vec3 rayOrigin, inout vec3 rayDirection, vec3 coneA, vec3 coneB, float radiusA, float radiusB, bool frontSurface ) {
                            vec4 coneHit = iCappedCone( rayOrigin, rayDirection, coneA, coneB, radiusA, radiusB, frontSurface );
                            if ( coneHit.x > 0.0 ) {
                                rayOrigin = rayOrigin + coneHit.x * rayDirection;
                                rayDirection = reflect( rayDirection, coneHit.yzw );
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
                        
                        bool intersectRayQuad( vec3 rayOrigin, vec3 rayDirection, vec3 quadPos, vec3 quadRot, vec2 quadSize, out float t, out vec3 hitColor, out vec2 hitUV ) {
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
                            hitUV = vec2(u + quadSize.x * 0.5, v + quadSize.y * 0.5) / quadSize;
                            
                            // Check if intersection is within quad bounds
                            if (abs(u) <= quadSize.x * 0.5 && abs(v) <= quadSize.y * 0.5) {
                                // Create a simple checkerboard pattern
                                float checkerSize = 0.05;
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

                            reflectOffCone( rayOrigin, rayDirection, vec3(0.0, 0.0, 0.0), vec3(0.0, 0.25, 0.0), 0.25, 0.75, true );

                            // Check for intersection with the image quad
                            float quadT = 0.0;
                            vec2 hitUV = vec2(0.0);
                            vec3 quadColor = vec3(0.0);
                            if (intersectRayQuad(rayOrigin, rayDirection, vec3(0.0, 0.0, 0.0), vec3(3.14159*0.5, 0.0, 0.0), vec2(1.2, 1.2), quadT, quadColor, hitUV)) {
                                gl_FragColor = texture( map, hitUV);
                            } else {
                                // Otherwise just cast the ray into the background
                                //gl_FragColor = texture( envMap, rayDirection );
                            }

                            #include <tonemapping_fragment>
                            #include <colorspace_fragment>
                            #include <fog_fragment>
                            #include <premultiplied_alpha_fragment>
                            #include <dithering_fragment>
                        }`
                } );

                // Create a plane to render the raytraced shader material
                this.sphereGeometry = new THREE.SphereGeometry( 5.5, 32, 32 );
                this.raytraceMesh = new THREE.Mesh( this.sphereGeometry, this.raytracedShaderMaterial );
                this.world.scene.add( this.raytraceMesh );

			});
    }

    patchObjectShader(shader) {
        shader.vertexShader = shader.vertexShader.replace(
            'void main() {',
            `uniform float slitAngle;
            
            float dot2( in vec3 v ) { return dot(v,v); }

            vec4 iCappedCone( in vec3  ro, in vec3  rd, 
                            in vec3  pa, in vec3  pb, 
                            in float ra, in float rb, 
                            in bool frontSurface ) {
                vec3  ba = pb - pa;
                vec3  oa = ro - pa;
                vec3  ob = ro - pb;
                
                float m0 = dot(ba,ba);
                float m1 = dot(oa,ba);
                float m2 = dot(ob,ba); 
                float m3 = dot(rd,ba);

                ////caps
                //    if( m1<0.0 ) { if( dot2(oa*m3-rd*m1)<(ra*ra*m3*m3) ) return vec4(-m1/m3,-ba*inversesqrt(m0)); }
                //else if( m2>0.0 ) { if( dot2(ob*m3-rd*m2)<(rb*rb*m3*m3) ) return vec4(-m2/m3, ba*inversesqrt(m0)); }
                
                // body
                float m4 = dot(rd,oa);
                float m5 = dot(oa,oa);
                float rr = ra - rb;
                float hy = m0 + rr*rr;
                
                float k2 = m0*m0    - m3*m3*hy;
                float k1 = m0*m0*m4 - m1*m3*hy + m0*ra*(rr*m3*1.0        );
                float k0 = m0*m0*m5 - m1*m1*hy + m0*ra*(rr*m1*2.0 - m0*ra);
                
                float h = k1*k1 - k2*k0;
                if( h<0.0 ) return vec4(-1.0);

                float t1 = (-k1-sqrt(h))/k2;
                float t2 = (-k1+sqrt(h))/k2;
                
                float t = frontSurface ? t1 : t2;
                
                // Check if t is valid and within cone bounds
                if( t > 0.0 ) {
                    float y = m1 + t*m3;
                    if( y>0.0 && y<m0 ) 
                    {
                        vec3 normal = normalize(m0*(m0*(oa+t*rd)+rr*ba*ra)-ba*hy*y);
                        return vec4(t, frontSurface ? normal : -normal);
                    }
                }
                
                return vec4(-1.0);
            }

            void reflectOffCone( inout vec3 rayOrigin, inout vec3 rayDirection, vec3 coneA, vec3 coneB, float radiusA, float radiusB, bool frontSurface ) {
                vec4 coneHit = iCappedCone( rayOrigin, rayDirection, coneA, coneB, radiusA, radiusB, frontSurface );
                if ( coneHit.x > 0.0 ) {
                    rayOrigin = rayOrigin + coneHit.x * rayDirection;
                    rayDirection = reflect( rayDirection, coneHit.yzw );
                }
            }
            vec3 constrainToLine(vec3 position, vec3 a, vec3 b) {
                vec3 ba = b - a; 
                float t = dot(position - a, ba) / dot(ba, ba);
                return mix(a, b, t);
            }

            //#define FLIP_SIDED False

            void main() {`
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <defaultnormal_vertex>',
            `vec3 transformedNormal = objectNormal;
            #ifdef USE_TANGENT
                vec3 transformedTangent = objectTangent;
            #endif
            transformedNormal = normalMatrix * transformedNormal;
            #ifdef USE_TANGENT
                transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
            #endif
            `
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            `vec4 mvPosition = vec4( transformed, 1.0 );

            vec4 worldPos = modelMatrix * vec4( transformed, 1.0 );
            vec3 slitStart = vec3(sin(slitAngle) * 0.75, 0.00, cos(slitAngle) * 0.75);
            vec3 slitEnd   = vec3(sin(slitAngle) * 0.75, 0.25, cos(slitAngle) * 0.75);

            // Project the worldPos onto the slit line to find the ray origin
            vec3 rayOrigin = constrainToLine(worldPos.xyz, slitStart, slitEnd);
            vec3 rayOffset = worldPos.xyz - rayOrigin;
            float rayOffsetLength = length(rayOffset);
            vec3 rayDir    = rayOffset / rayOffsetLength;

            // Cast the ray towards the world position, and reflect off of the cone
            reflectOffCone( rayOrigin, rayDir, vec3(0.0, 0.0, 0.0), vec3(0.0, 0.25, 0.0), 0.25, 0.75, true );

            // Trace the ray towards the XZ plane and set the world position to that
            vec4 newWorldPos = vec4(rayOrigin + (rayDir * (-rayOrigin.y / rayDir.y) * (1.0 + (rayOffsetLength * 0.01))), 1.0);

            // Set the gl_Position as normal
            mvPosition  = modelViewMatrix * mvPosition;
            gl_Position = projectionMatrix * viewMatrix * newWorldPos;
            `
        );
    };

    /** Update the simulation */
    update(timeMS) {
        if(this.physicalCamera){
            this.deltaTime = 1000.0/240.0;///timeMS - this.timeMS;
            this.timeMS = timeMS;
            if(this.mesh && this.mesh.material && this.mesh.material.uniforms && this.mesh.material.uniforms.slitAngle){
                this.slitAngle = (this.slitAngle || 0) + (this.deltaTime / 1000.0) * Math.PI * 2.0 * 2.0;// * 6.0;
                if(this.slitAngle > Math.PI * 2.0){ this.slitAngle -= Math.PI * 2.0; }

                for(let i = 0; i < this.meshes.length; i++){
                    let mesh = this.meshes[i];
                    mesh.material.uniforms.slitAngle.value = this.slitAngle + (Math.PI * 2 * i / this.meshes.length);
                    mesh.material.needsUpdate = true;
                }
            }
            this.world.controls.update();

			// Render first scene into texture
			this.world.renderer.setRenderTarget( this.rtTexture );
			this.world.renderer.clear();
			this.world.renderer.render( this.objectScene, this.objectCamera );

			// Render full screen quad with generated texture
			this.world.renderer.setRenderTarget( null );
			this.world.renderer.clear();

            //this.physicalCamera.render( this.deltaTime / 1000.0 );
            this.world.renderer.render(this.world.scene, this.world.camera);
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
