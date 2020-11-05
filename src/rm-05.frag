#version 300 es
precision lowp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec4 u_mouse;
uniform vec3 u_palette[8];
uniform float u_shiny[8];
uniform vec3 u_background[30];

const float pi = 3.141592653589793;
const float tau = pi * 2.0;
const float hpi = pi * 0.5;
const float qpi = pi * 0.25;
const float phi = (1.0+sqrt(5.0))/2.0;

out vec4 outColor;


#define MAX_STEPS 100
#define MAX_DIST 150.
#define SURF_DIST .001

#define ROT(a) mat2(cos(a), -sin(a), sin(a), cos(a))
#define SHEARX(a) mat2(1, 0, sin(a), 1)

float rand(float n){return fract(sin(n) * 43758.5453123);}

// Camera helper

vec3 Camera(vec2 uv, vec3 p, vec3 l, float z) {
    vec3 f = normalize(l-p),
    r = normalize(
    cross(
    vec3(0, 1, 0),
    f
    )
    ),
    u = cross(f, r),
    c = p + f * z,
    i = c + uv.x*r + uv.y*u,
    d = normalize(i-p);
    return d;
}


// 2d rotation matrix helper
mat2 Rot(float a) {
    float x = cos(a);
    float y = sin(a);
    return mat2(x, -y, y, x);
}

// RAY MARCHING PRIMITIVES

float smin(float a, float b, float k) {
    float h = clamp(0.5+0.5*(b-a)/k, 0., 1.);
    return mix(b, a, h) - k*h*(1.0-h);
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 ab = b-a;
    vec3 ap = p-a;

    float t = dot(ab, ap) / dot(ab, ab);
    t = clamp(t, 0., 1.);

    vec3 c = a + t*ab;

    return length(p-c)-r;
}

float sdCylinder(vec3 p, vec3 a, vec3 b, float r) {
    vec3 ab = b-a;
    vec3 ap = p-a;

    float t = dot(ab, ap) / dot(ab, ab);
    //t = clamp(t, 0., 1.);

    vec3 c = a + t*ab;

    float x = length(p-c)-r;
    float y = (abs(t-.5)-.5)*length(ab);
    float e = length(max(vec2(x, y), 0.));
    float i = min(max(x, y), 0.);

    return e+i;
}

float sdCappedCylinder( vec3 p, float h, float r )
{
    vec2 d = abs(vec2(length(p.xz),p.y)) - vec2(h,r);
    return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

float sdSphere(vec3 p, float s)
{
    return length(p)-s;
}

float sdTorus(vec3 p, vec2 r) {
    float x = length(p.xz)-r.x;
    return length(vec2(x, p.y))-r.y;
}

float sdRoundBox(vec3 p, vec3 b, float r)
{
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}


float sdBeam(vec3 p, vec3 c)
{
    return length(p.xz-c.xy)-c.z;
}

float dBox(vec3 p, vec3 s) {
    p = abs(p)-s;
    return length(max(p, 0.))+min(max(p.x, max(p.y, p.z)), 0.);
}

vec2 opUnion(vec2 curr, float d, float id)
{
    if (d < curr.x)
    {
        curr.x = d;
        curr.y = id;
    }

    return curr;
}

vec2 softMinUnion(vec2 curr, float d, float id)
{
    if (d < curr.x)
    {
        curr.x = smin(curr.x, d, 0.5);
        curr.y = id;
    }

    return curr;
}


float sdBoundingBox(vec3 p, vec3 b, float e)
{
    p = abs(p)-b;
    vec3 q = abs(p+e)-e;
    return min(min(
    length(max(vec3(p.x, q.y, q.z), 0.0))+min(max(p.x, max(q.y, q.z)), 0.0),
    length(max(vec3(q.x, p.y, q.z), 0.0))+min(max(q.x, max(p.y, q.z)), 0.0)),
    length(max(vec3(q.x, q.y, p.z), 0.0))+min(max(q.x, max(q.y, p.z)), 0.0));
}

float sdHexPrism( vec3 p, vec2 h )
{
    const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
    p = abs(p);
    p.xy -= 2.0*min(dot(k.xy, p.xy), 0.0)*k.xy;
    vec2 d = vec2(
    length(p.xy-vec2(clamp(p.x,-k.z*h.x,k.z*h.x), h.x))*sign(p.y-h.x),
    p.z-h.y );
    return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

float shape(float v, float x)
{
    return x > 0.0 ? -abs(v) : abs(v);
}

const mat2 frontPlaneRot = ROT(0.05235987755982988);
const mat2 backPlaneRot = ROT(-0.05235987755982988);
const mat2 sCutRot = ROT(0.88);
const mat2 rotate90 = ROT(1.5707963267948966);
const mat2 rotate60 = ROT(1.0471975511965976);
const mat2 rotate30 = ROT(0.5235987755982988);
const mat2 fourShear = SHEARX(-0.20943951023931953);


const float sin60 = sin(tau/6.0);
vec2 N22 (vec2 p) {
    vec3 a = fract(p.xyx*vec3(123.34, 234.34, 345.65));
    a += dot(a, a+34.45);
    return fract(vec2(a.x*a.y, a.y*a.z));
}

float atan2(in float y, in float x)
{
    return abs(x) > abs(y) ? hpi - atan(x,y) : atan(y,x);
}
float ndot( in vec2 a, in vec2 b ) { return a.x*b.x - a.y*b.y; }

float sdRhombus( in vec2 p, in vec2 b )
{
    vec2 q = abs(p);
    float h = clamp((-2.0*ndot(q,b)+ndot(b,b))/dot(b,b),-1.0,1.0);
    float d = length( q - 0.5*b*vec2(1.0-h,1.0+h) );
    return d * sign( q.x*b.y + q.y*b.x - b.x*b.y );
}


float sdEquilateralTriangle( in vec2 p )
{
    const float k = sqrt(3.0);
    p.x = abs(p.x) - 1.0;
    p.y = p.y + 1.0/k;
    if( p.x+k*p.y>0.0 ) p = vec2(p.x-k*p.y,-k*p.x-p.y)/2.0;
    p.x -= clamp( p.x, -2.0, 0.0 );
    return -length(p)*sign(p.y);
}

float sdStar5(in vec2 p, in float r, in float rf)
{
    const vec2 k1 = vec2(0.809016994375, -0.587785252292);
    const vec2 k2 = vec2(-k1.x,k1.y);
    p.x = abs(p.x);
    p -= 2.0*max(dot(k1,p),0.0)*k1;
    p -= 2.0*max(dot(k2,p),0.0)*k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf*vec2(-k1.y,k1.x) - vec2(0,1);
    float h = clamp( dot(p,ba)/dot(ba,ba), 0.0, r );
    return length(p-ba*h) * sign(p.y*ba.x-p.x*ba.y);
}

vec2 getDistance(vec3 p) {

    vec2 result = vec2(1e6, 1.0);
    result = opUnion(result, sdTorus(p - vec3(0,1,0), vec2(2, 0.5)) - 0.05, 1.0);
    return result;

}


vec3 rayMarch(vec3 ro, vec3 rd) {


    float dO = 0.;
    float id = 0.0;

    int i;

    for (i=0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd*dO;
        vec2 result = getDistance(p);
        float dS = result.x;
        dO += dS;
        id = result.y;
        if (dO > MAX_DIST || abs(dS) < SURF_DIST * (dO*.125 + 1.))
        break;
    }

    return vec3(dO, id, i);
}

vec3 getNormal(vec3 p) {
    float d = getDistance(p).x;
    vec2 e = vec2(.001, 0);

    vec3 n = d - vec3(
    getDistance(p-e.xyy).x,
    getDistance(p-e.yxy).x,
    getDistance(p-e.yyx).x
    );

    return normalize(n);
}


vec3 getPaletteColor(float id)
{
    int last = u_palette.length() - 1;
    //return id < float(last) ? mix(u_palette[int(id)], u_palette[int(id) + 1], fract(id)) : u_palette[last];
    return mix(u_palette[int(id)], u_palette[int(id) + 1], fract(id));
}



vec3 applyFog(
in vec3  rgb,      // original color of the pixel
in float distance, // camera to point distance
in vec3  rayOri,   // camera position
in vec3  rayDir,
in vec3 p     // camera to point vector
)
{
    float pos = p.z;

    float c = 0.005;
    float b = 2.0;// + sin((pos + p.x * sin(pos * 0.27)) * 0.31 ) * 0.15 + sin(pos * 0.17 ) * 0.15;

    float fogAmount = c * exp(-rayOri.y*b) * (1.0-exp( -distance*rayDir.y*b ))/rayDir.y;
    vec3  fogColor  = vec3(1);
    return mix( rgb, fogColor, fogAmount );
}


float softshadow( in vec3 ro, in vec3 rd, float k, float mx )
{
    float res = 1.0;
    float ph = 1e20;
    for( float t=0.001; t < mx; )
    {
        float h = getDistance(ro + rd*t).x;
        if( h < 0.0001 )
        return 0.0;

        float y = h * h / ( 2.0 * ph );
        float d = sqrt( h * h - y * y);
        res = min( res, k * d /max(0.0, t -y) );
        ph = h;
        t += h;
    }
    return res;
}


vec3 getBackground(in vec3 n, int offset)
{

    vec3 tb = vec3(0, n.y > 0.0 ? 1 : -1 , 0);
    vec3 tbCol = u_background[offset + (n.y > 0.0 ? 5 : 4)];

    vec3 rl = vec3(n.x > 0.0 ? 1 : -1 , 0, 0);
    vec3 rlCol = u_background[offset + (n.x > 0.0 ? 0 : 2)];

    vec3 fb = vec3(0, 0, n.z > 0.0 ? 1 : -1);
    vec3 fbCol = u_background[offset + (n.z > 0.0 ? 1 : 3)];


    float a1 = length(cross(n, tb));
    float a2 = length(cross(n, rl));
    float a3 = length(cross(n, fb));

    return tbCol * (1.0 - a1) + rlCol * (1.0 - a2) + fbCol * (1.0 - a3);
}


void main(void)
{
    vec2 uv = (gl_FragCoord.xy-.5*u_resolution.xy)/u_resolution.y;

    vec2 m = u_mouse.xy/u_resolution.xy;

    vec3 ro = vec3(
    0,
    6,
    -10
    );

    ro.yz *= Rot((-m.y + 0.5) * pi + u_time * 0.27);
    ro.xz *= Rot((-m.x + 0.5) * 7.0 - u_time * 0.31);

    vec3 lookAt = vec3(0, 1, 0);

    vec3 rd = Camera(uv, ro, lookAt, 1.5);

    float t = u_time * 0.025;

    float pos = fract(t * 4.0);
    float id = mod(floor(t * 4.0), 4.0);
    int offset = int(id + step(0.5, -2. + (pos * 4.0) + sin(length(vec2(rand(id) * 0.5, rand(id+12.0) * 0.5) - uv)))) * 6;


    vec3 col = getBackground(rd, offset);

    vec3 result = rayMarch(ro, rd);
    float d = result.x;

    vec3 p = ro + rd * d;
    if (d < MAX_DIST) {

        vec3 lightPos = vec3(-4,4,-4);
        //vec3 lightPos = vec3(-40,20,0);
        vec3 lightDir = normalize(lightPos - p);
        vec3 norm = getNormal(p);

        vec3 lightColor = vec3(1.0);

        float id = result.y;

        // ambient
        vec3 ambient = lightColor * vec3(0.001,0.005,0.01);

        // diffuse
        float diff = max(dot(norm, lightDir), 0.0);
        vec3 tone = getPaletteColor(id);

        //float shadow = softshadow(p, lightDir, 2.0);
        //vec3 diffuse = lightColor * pow(vec3(shadow),vec3(1.0,1.2,1.5)) * (diff * tone);


        // specular
        vec3 viewDir = normalize(rd);
        vec3 reflectDir = reflect(lightDir, norm);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), u_shiny[int(id)]);
        //float shadow = softshadow(p, lightDir, 10.0, length(lightPos - p));
        vec3 specular = lightColor * spec * vec3(0.7843,0.8823,0.9451) * 0.5;

        vec3 ref = getBackground(reflect(rd, norm), offset);
        vec3 diffuse = diff * tone;

        col = ref * 0.7 + ambient + (diffuse + specular) ;

    }
    //col = applyFog(col, d, ro, rd, p);

    col = pow(col, vec3(1.0/2.2));

    outColor = vec4(
        col,
        1.0
    );

    //outColor = vec4(1,0,1,1);
}
