import * as THREE from "three";

export class OitRenderer {
  constructor(renderer, size) {
    this.renderer = renderer;
    // 三个渲染目标：颜色、透明度、不透明物
    this.colorTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    });

    this.alphaTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RedFormat,
      type: THREE.FloatType,
    });

    this.opaqueTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      stencilBuffer: false,
    });
    this.opaqueTarget.depthTexture = new THREE.DepthTexture({
      type: THREE.FloatType,
    });

    // 全局uniforms，这里单独存储，在compile之前赋值给shader，而不作用于material
    this.globalUniforms = {
      uScreenSize: { value: new THREE.Vector2(size.width, size.height) },
      uOpaqueDepth: { value: this.opaqueTarget.depthTexture },
    };

    // 输出场景的材质和着色器算法
    this.compositingMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uAccumulate: { value: null },
        uAccumulateAlpha: { value: null },
        uOpaque: { value: null },
      },
      vertexShader: `
      varying vec2 vUv;
            void main()
            {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}`,
      fragmentShader: `
      //precision highp float;

			varying vec2 vUv;
			uniform sampler2D uAccumulate;
			uniform sampler2D uAccumulateAlpha;
			uniform sampler2D uOpaque;

			void main() {

                vec4 accum = texture2D( uAccumulate, vUv );

                float r = accum.a;
                accum.a = texture2D(uAccumulateAlpha, vUv).r;

                vec4 color = vec4(accum.rgb / clamp(accum.a, 0.0001, 50000.0), r);
                color.rgb = pow(color.rgb, vec3(1.0/2.2));
                color = vec4((1.0-r) * accum.rgb / clamp(accum.a, 0.001, 50000.0), r);

                vec4 opaqueColor = texture2D(uOpaque, vUv).rgba;
                vec3 outputColor = mix(color.rgb, opaqueColor.rgb, color.a);

                gl_FragColor = vec4(outputColor.rgb, 1);
			}`,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });

    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(
      new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositingMaterial)
    );
  }

  weightShader(shader) {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <packing>",
      ""
    );
    shader.fragmentShader = `
					#include <packing>
                    uniform sampler2D uOpaqueDepth;
                    uniform vec2 uScreenSize;
					//calc weight
					float weight(float z, float a) {
                        return clamp(pow(min(1.0, a * 10.0) + 0.01, 3.0) * 1e8 * pow(1.0 - z * 0.9, 3.0), 1e-2, 3e3);
                    }
					${shader.fragmentShader}
				`;
  }

  colorOnBeforeCompile(shader) {
    shader.uniforms.uOpaqueDepth = this.globalUniforms.uOpaqueDepth;
    shader.uniforms.uScreenSize = this.globalUniforms.uScreenSize;
    //改颜色
    shader.fragmentShader = shader.fragmentShader.replace(
      /}$/gm,
      `
                float w = weight(gl_FragCoord.z, gl_FragColor.a);
                gl_FragColor.rgb = gl_FragColor.rgb * gl_FragColor.a;
                gl_FragColor = vec4(gl_FragColor.rgb * w, gl_FragColor.a);

                vec2 screenPos = gl_FragCoord.xy * uScreenSize;
                vec4 dep =  texture2D( uOpaqueDepth, screenPos );

                 //float dddd = unpackRGBAToDepth(dep);
                 float dddd = dep.r;
                 if (gl_FragCoord.z > dddd)
                    discard;
            }
            `
    );
    this.weightShader(shader);
  }

  alphaOnBeforeCompile(shader) {
    shader.uniforms.uOpaqueDepth = this.globalUniforms.uOpaqueDepth;
    shader.uniforms.uScreenSize = this.globalUniforms.uScreenSize;
    //改颜色
    shader.fragmentShader = shader.fragmentShader.replace(
      /}$/gm,
      `
                float w = weight(gl_FragCoord.z, gl_FragColor.a);
                gl_FragColor = vec4(gl_FragColor.a*w, gl_FragColor.a*w, gl_FragColor.a*w, gl_FragColor.a*w);

                  vec2 screenPos = gl_FragCoord.xy * uScreenSize;
                  vec4 dep =  texture2D( uOpaqueDepth, screenPos );
                  float dddd = dep.r;

                 //float dddd = unpackRGBAToDepth(dep);
                 if (gl_FragCoord.z > dddd)
                    discard;

                 //gl_FragColor.rgb = vec3(1,0,0);
            }
            `
    );
    this.weightShader(shader);
  }

  cloneMaterial(material) {
    //OIT 材质  克隆原透明材质
    let materialColor = material.clone();
    //设置混合参数
    materialColor.blending = THREE.CustomBlending;
    materialColor.blendSrc = THREE.OneFactor;
    materialColor.blendDst = THREE.OneFactor;
    materialColor.blendSrcAlpha = THREE.ZeroFactor;
    materialColor.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    //materialColor.blendEquation = THREE.AddEquation
    materialColor.depthWrite = false;
    materialColor.depthTest = false;
    materialColor.depthFunc = THREE.AlwaysDepth;
    //设置回调函数编译前 替换shader代码
    materialColor.onBeforeCompile = this.colorOnBeforeCompile.bind(this);

    //OIT alpha材质
    let materialAlpha = materialColor.clone();
    materialAlpha.onBeforeCompile = this.alphaOnBeforeCompile.bind(this);
    return {
      materialSrc: material,
      materialColor: materialColor,
      materialAlpha: materialAlpha,
    };
  }

  render(scene, camera, opaqueObjects, transparentObjects) {
    // 物体在透明算法中的渲染与否通过material的visible控制，mesh的visible交给用户控制
    // 克隆透明材质
    let clones = transparentObjects.map((v, i) =>
      this.cloneMaterial(v.material)
    );
    // 不透明渲染
    transparentObjects.forEach((o) => (o.material.visible = false));
    opaqueObjects.forEach((o) => (o.material.visible = true));
    this.renderer.setClearColor(0, 1);
    this.renderer.setRenderTarget(this.opaqueTarget);
    this.renderer.render(scene, camera);
    // 透明渲染
    opaqueObjects.forEach((o) => (o.material.visible = false));
    this.globalUniforms.uOpaqueDepth.value = this.opaqueTarget.depthTexture;
    for (let i in transparentObjects) {
      transparentObjects[i].material = clones[i].materialColor;
      transparentObjects[i].material.visible = true;
    }
    this.renderer.setRenderTarget(this.colorTarget);
    this.renderer.render(scene, camera);
    for (let i in transparentObjects) {
      transparentObjects[i].material = clones[i].materialAlpha;
      transparentObjects[i].material.visible = true;
    }
    this.renderer.setRenderTarget(this.alphaTarget);
    this.renderer.render(scene, camera);
    for (let i in transparentObjects) {
      transparentObjects[i].material = clones[i].materialSrc;
      transparentObjects[i].material.visible = true;
    }
    // 输出渲染，更新材质纹理
    this.compositingMaterial.uniforms.uAccumulate.value = this.colorTarget.texture;
    this.compositingMaterial.uniforms.uAccumulateAlpha.value = this.alphaTarget.texture;
    this.compositingMaterial.uniforms.uOpaque.value = this.opaqueTarget.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }
}

export default OitRenderer;
