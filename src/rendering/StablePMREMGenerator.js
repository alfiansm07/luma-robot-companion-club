import { PMREMGenerator } from 'three';

const NORMAL_INCIDENCE_CALL = 'importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness)';
const ORIGINAL_SAMPLER = `vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}`;
const STABLE_SAMPLER = `vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				return normalize(vec3(alpha * r * cos(phi), alpha * r * sin(phi), sqrt(max(0.0, 1.0 - Xi.x))));
			}`;

/**
 * Three 0.186.1's PMREM always samples at normal incidence, V = (0, 0, 1).
 * Here s = 1 and t1² + t2² = Xi.x, so reconstruct z from the radial sample
 * instead of subtracting squared trig results. This removes ANGLE X4122
 * constant-folding precision warnings without changing the GGX distribution,
 * sample count, environment capture, or roughness mip chain.
 *
 * PMREM has no public material hook. Keep this private boundary narrow and
 * fail explicitly on upstream changes rather than silently patching other math.
 */
export class StablePMREMGenerator extends PMREMGenerator {
  _allocateTargets() {
    const target = super._allocateTargets();
    const material = this._ggxMaterial;
    if (material === this._stableGGXMaterial) return target;
    const source = material.fragmentShader;
    if (
      source.split(ORIGINAL_SAMPLER).length !== 2 ||
      source.split(NORMAL_INCIDENCE_CALL).length !== 2 ||
      source.split('importanceSampleGGX_VNDF(').length !== 3
    ) {
      target.dispose();
      this.dispose();
      throw new Error('Three PMREM sampling changed; review the normal-incidence specialization.');
    }
    material.fragmentShader = source.replace(ORIGINAL_SAMPLER, STABLE_SAMPLER);
    this._stableGGXMaterial = material;
    return target;
  }
}
