const SB_URL='https://mchuhgihywnyamurbetz.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHVoZ2loeXdueWFtdXJiZXR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTIyNDIsImV4cCI6MjA5NzcyODI0Mn0.z1ildAJY--ErFoom2d7GIF1TCr3fmaBkCWtwGz4QstI';
const GAS='https://script.google.com/macros/s/AKfycbxO5RHZcHojCy-d65QiKDMnk4d-z_d_vCCqAETetTnr0kVqMoRXp6yrep8AuU3mmCtNuw/exec';
const CS='6285727318698';
const MASTER='maurizky';
const EJS_SVC='service_rrsorch';
const EJS_TPL='template_2c90tho';
const EJS_KEY='UJrtG5gzUPPDMtuxM';
// Init EmailJS setelah DOM ready
document.addEventListener('DOMContentLoaded',()=>{
  if(typeof emailjs!=='undefined'){
    emailjs.init({publicKey:EJS_KEY});
    console.log('EmailJS initialized');
  }
});
const PLANS={free:{label:'Free',price:'Rp 0/bulan',ai:false},basic:{label:'Basic',price:'Rp 19.000/bulan',ai:false},pro:{label:'Pro',price:'Rp 34.000/bulan',ai:true},unlimited:{label:'Ultimate',price:'Rp 49.000/bulan',ai:true}};
const TOKEN_PACKS=[{id:'2M',tokens:2000000,price:'Rp 29.000/bln',label:'2 Juta Token'},{id:'5M',tokens:5000000,price:'Rp 39.000/bln',label:'5 Juta Token'}];
const LIMITS={free:{ai:0,scan:0,label:'Free'},basic:{ai:0,scan:0,label:'Basic'},pro:{ai:50,scan:20,label:'Pro'},unlimited:{ai:-1,scan:-1,label:'Ultimate'}};

