import * as THREE from '../node_modules/three/build/three.module.js';
import { GUI } from '../node_modules/three/examples/jsm/libs/lil-gui.module.min.js';
import World from './World.js';
import { TransformControls } from '../node_modules/three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { Pass, FullScreenQuad } from '../node_modules/three/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from '../node_modules/three/examples/jsm/shaders/CopyShader.js';
import { EffectComposer } from '../node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../node_modules/three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from '../node_modules/three/examples/jsm/postprocessing/OutputPass.js';
import { RGBELoader } from '../node_modules/three/examples/jsm/loaders/RGBELoader.js';
import { frameCorners } from '../node_modules/three/examples/jsm/utils/CameraUtils.js';

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
            resolution: 1024,
            aperture: 0.05,
            focalDistance: 1.73,
        };
        this.gui = new GUI();
        this.gui.add(this.simulationParams, 'numViews', 1, 10, 1).name('Number of Views');//.onChange((value) => { this.setupPhotodiodes(); });
        this.gui.add(this.simulationParams, 'resolution', 256, 2048, 256).name('Resolution');
        this.gui.add(this.simulationParams, 'aperture', 0.0, 1.0, 0.01).name('Aperture Size');
        this.gui.add(this.simulationParams, 'focalDistance', 0.0, 10.0, 0.01).name('Focal Distance');

        // Construct the render world
        this.world = new World(this);

        let aspect =  window.innerWidth / window.innerHeight;

        let bottomLeftCorner  = new THREE.Vector3( -0.6 * aspect, -0.6, -1.0 ).multiplyScalar( this.simulationParams.focalDistance );
        let bottomRightCorner = new THREE.Vector3(  0.6 * aspect, -0.6, -1.0 ).multiplyScalar( this.simulationParams.focalDistance );
        let topLeftCorner     = new THREE.Vector3( -0.6 * aspect,  0.6, -1.0 ).multiplyScalar( this.simulationParams.focalDistance );
        this.renderCameras = [];
        for ( let y = 0; y < this.simulationParams.numViews; y++ ) {
            for ( let x = 0; x < this.simulationParams.numViews; x++ ) {
                let subcamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 10.0);
                let xRes = this.simulationParams.resolution;
                let yRes = this.simulationParams.resolution;
                subcamera.viewport = new THREE.Vector4( Math.floor( x * xRes ),
                                                        Math.floor( y * yRes ),
                                                        Math.ceil( xRes ),
                                                        Math.ceil( yRes ) );

                subcamera.position.x = (( x / this.simulationParams.numViews ) - 0.5) * this.simulationParams.aperture;
                subcamera.position.y = (( y / this.simulationParams.numViews ) - 0.5) * this.simulationParams.aperture;
                subcamera.position.z = 0;
                subcamera.updateMatrixWorld();

                // TODO: Set the off-axis camera matrix using the kooima method
                frameCorners( subcamera, bottomLeftCorner, bottomRightCorner, topLeftCorner, true );

                this.renderCameras.push( subcamera );
            }
        }
        this.arraycamera = new THREE.ArrayCamera( this.renderCameras );
        this.world.camera.add( this.arraycamera );
        for ( let i = 0; i < this.renderCameras.length; i++ ) {
            this.arraycamera.add(this.renderCameras[i]);
        }

		new RGBELoader()
			.setPath('assets/')
			.load('quarry_01_1k.hdr', (texture) => {
				texture.mapping = THREE.EquirectangularReflectionMapping;
				this.world.scene.background = texture;
				this.world.scene.environment = texture;
			});

        // Make Effect Composer
        this.composer = new EffectComposer( this.world.renderer );
        this.composer.setSize( this.simulationParams.resolution * (this.simulationParams.numViews), 
                               this.simulationParams.resolution * (this.simulationParams.numViews) );
        this.composer.setPixelRatio( this.world.renderer.getPixelRatio() );
        this.composer.addPass( new RenderPass( this.world.scene, this.arraycamera ) );
        this.composer.addPass( new AveragingPass() );
        this.composer.passes[ 1 ].uniforms.views.value = this.simulationParams.numViews;
        this.composer.passes[ 1 ].uniforms.renderToScreen = true;
        this.composer.addPass( new OutputPass() );
    }

    /** Update the simulation */
    update(timeMS) {
        this.deltaTime = timeMS - this.timeMS;
        this.timeMS = timeMS;
        this.world.controls.update();
        this.composer.render( this.deltaTime / 1000.0 );
        //this.world.renderer.render(this.world.scene, this.arraycamera);
        this.world.stats.update();
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

class AveragingPass extends Pass {
	constructor( ) {
		super();
		this.uniforms = { 'tDiffuse': { value: null }, 'views': { value: 10 } };
		this.material = new THREE.ShaderMaterial( {
			uniforms: this.uniforms,
			vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }`,
			fragmentShader: `
                varying vec2 vUv;
                uniform sampler2D tDiffuse;
                uniform int views;
                void main() {
                    vec4 averageColor = vec4(0.0, 0.0, 0.0, 0.0);
                    for (int i = 0; i < views; i++) {
                        for (int j = 0; j < views; j++) {
                            vec2 cellUV = (vUv + vec2(float(i), float(j))) / float(views);
                            averageColor += texture2D( tDiffuse, cellUV );
                        }
                    }
                    gl_FragColor = averageColor / float(views * views);
                    //gl_FragColor    = texture2D( tDiffuse, vUv );
                }`
		} );

		this.copyFsMaterial = new THREE.ShaderMaterial( {
			uniforms: THREE.UniformsUtils.clone( CopyShader.uniforms ),
			vertexShader: CopyShader.vertexShader,
			fragmentShader: CopyShader.fragmentShader,
			blending: THREE.NoBlending,
			depthTest: false,
			depthWrite: false
		} );
		this.fsQuad     = new FullScreenQuad( this.material );
	}
	render( renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */ ) {
		this.uniforms[ 'tDiffuse' ].value = readBuffer.texture;
		if ( this.renderToScreen ) {
			renderer.setRenderTarget( null );
			this.fsQuad.render( renderer );
		} else {
			renderer.setRenderTarget( writeBuffer );
			if ( this.clear ) renderer.clear();
			this.fsQuad.render( renderer );
		}
	}
	dispose() {
		this.material.dispose();
		this.fsQuad.dispose();
	}
}

var main = new Main();
