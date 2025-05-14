import * as THREE from '../node_modules/three/build/three.module.js';

import { Pass, FullScreenQuad } from '../node_modules/three/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from '../node_modules/three/examples/jsm/shaders/CopyShader.js';
import { EffectComposer } from '../node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../node_modules/three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from '../node_modules/three/examples/jsm/postprocessing/OutputPass.js';
import { frameCorners } from '../node_modules/three/examples/jsm/utils/CameraUtils.js';

export default class PhysicalDoFCamera {
    constructor(renderer, scene, camera) {
        this.renderer      = renderer;
        this.scene         = scene;
        this.baseCamera    = camera;
        this.numViews      = 4;
        this.resolution = 4096;
        this.aperture      = 0.05;
        this.focalDistance = 1.73;

        this.setupCamera();
    }

    setupCamera() {
        if(this.arrayCamera) {
            this.arrayCamera.removeFromParent();
            this.arrayCamera = null;
            this.renderCameras = null;
            this.composer.dispose();
            this.composer = null;
        }

        let aspect =  window.innerWidth / window.innerHeight;

        let bottomLeftCorner  = new THREE.Vector3( -0.6 * aspect, -0.6, -1.0 ).multiplyScalar( this.focalDistance );
        let bottomRightCorner = new THREE.Vector3(  0.6 * aspect, -0.6, -1.0 ).multiplyScalar( this.focalDistance );
        let topLeftCorner     = new THREE.Vector3( -0.6 * aspect,  0.6, -1.0 ).multiplyScalar( this.focalDistance );
        this.renderCameras = [];
        for ( let y = 0; y < this.numViews; y++ ) {
            for ( let x = 0; x < this.numViews; x++ ) {
                let subcamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 10.0);
                let xRes = this.resolution / this.numViews;
                let yRes = this.resolution / this.numViews;
                subcamera.viewport = new THREE.Vector4( Math.floor( x * xRes ),
                                                        Math.floor( y * yRes ),
                                                        Math.ceil( xRes ),
                                                        Math.ceil( yRes ) );

                subcamera.position.x = (( x / this.numViews ) - 0.5) * this.aperture;
                subcamera.position.y = (( y / this.numViews ) - 0.5) * this.aperture;
                subcamera.position.z = 0;
                subcamera.updateMatrixWorld();

                // Set the off-axis camera matrix using the kooima method
                frameCorners( subcamera, bottomLeftCorner, bottomRightCorner, topLeftCorner, true );

                this.renderCameras.push( subcamera );
            }
        }
        this.arrayCamera = new THREE.ArrayCamera( this.renderCameras );
        this.baseCamera.add( this.arrayCamera );
        for ( let i = 0; i < this.renderCameras.length; i++ ) {
            this.arrayCamera.add(this.renderCameras[i]);
        }

        // Make Effect Composer
        this.composer = new EffectComposer( this.renderer );
        this.composer.setSize( this.resolution, this.resolution );
        this.composer.setPixelRatio( this.renderer.getPixelRatio() );
        this.composer.addPass( new RenderPass( this.scene, this.arrayCamera ) );
        this.composer.addPass( new AveragingPass() );
        this.composer.passes[ 1 ].uniforms.views.value = this.numViews;
        this.composer.passes[ 1 ].uniforms.renderToScreen = true;
        this.composer.addPass( new OutputPass() );
    }

    render(deltaTime) {
        this.composer.render( deltaTime );
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
