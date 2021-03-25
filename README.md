# Order-independent-rendering-

A simple class that wraps your renderer and provide basic oit rendering for your opaque and transparent objects, based on three.js.

提供一个简单的类，用它包装你的渲染器，并且在渲染时，除了提供相机和场景以外，提供不透明和透明物体的列表，即可完成顺序无关的渲染。

原理是：将不透明物体和透明物体分别渲染后，提取深度、颜色、透明度材质，按照wboit的公式渲染到一个2x2的平面上，通过正交相机渲染到画布上。

着色器仅仅实现了最基本的算法，可以进一步修改以实现材质贴图和光影效果。需要注意的是，代码基于three.js，部分着色器的变量已经定义。
