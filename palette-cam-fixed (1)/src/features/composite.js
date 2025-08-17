
export function renderPaletteInto(container, colors){
  container.innerHTML='';
  colors.forEach(rgb=>{
    const sw = document.createElement('div');
    sw.className='swatch';
    sw.style.background = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    container.appendChild(sw);
  });
}
