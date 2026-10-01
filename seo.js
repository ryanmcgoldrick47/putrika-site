// Sets title, description, canonical, Open Graph and Twitter tags. Usage: <script src="seo.js" data-page="music"></script>
(function(){
var SITE='https://putrika.net';
var DESC='alt-soul electronica / from java island to dharawal country';
var PAGES={
 home:{path:'/',title:'Putrika'},
 music:{path:'/music',title:'Putrika: Music',desc:'Wanita, the 10 track album by Putrika. Released 26 September 2025.'},
 about:{path:'/about',title:'Putrika: About',desc:'Jakarta-born, Dharawal country-based singer, songwriter, and electronic music producer'},
 shows:{path:'/shows',title:'Putrika: Shows'},
 booking:{path:'/booking',title:'Putrika: Booking'},
 notfound:{path:'/404',title:'Putrika: Page not found',noindex:true}
};
var s=document.currentScript, p=PAGES[(s&&s.dataset.page)||'home']||PAGES.home, h=document.head;
function meta(k,v,attr){var m=document.createElement('meta');m.setAttribute(attr||'name',k);m.content=v;h.appendChild(m);}
document.title=p.title;
var d=p.desc||DESC, url=SITE+p.path, img=SITE+'/brand/og-image.png';
meta('description',d);
if(p.noindex)meta('robots','noindex');
var l=document.createElement('link');l.rel='canonical';l.href=url;h.appendChild(l);
[['og:type','website'],['og:site_name','Putrika'],['og:title',p.title],['og:description',d],['og:url',url],['og:image',img],['og:image:width','1200'],['og:image:height','630']].forEach(function(x){meta(x[0],x[1],'property');});
meta('twitter:card','summary_large_image');meta('twitter:image',img);
})();
