(async()=>{
  try{
    const r=await fetch('/index.html',{cache:'no-store'});
    let html=await r.text();
    html=html.replace('</head>','<link rel="stylesheet" href="/app-live.css"></head>');
    html=html.replace('</body>','<script type="module" src="/app-live.js"></'+'script></body>');
    document.open(); document.write(html); document.close();
  }catch(e){document.body.innerHTML='<p style="font-family:system-ui;padding:30px">Não foi possível carregar o Vania Work.</p>'}
})();
