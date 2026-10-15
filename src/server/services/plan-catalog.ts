export type PlanId = "BASIC" | "PRO" | "PREMIUM";
export type FeatureName = "booking" | "gallery" | "reviews" | "advanced_statistics" | "custom_domain" | "advanced_branding" | "export_reports";
export type PlanLimits = { maxBarbers:number|null; maxServices:number|null; maxGalleryImages:number|null; maxCustomers:number|null; maxBookingsPerMonth:number|null };

// Central catalog; prices intentionally remain unset until commercial pricing is approved.
export const PLAN_CATALOG:Record<PlanId,{name:string;code:PlanId;monthlyPrice:number|null;yearlyPrice:number|null;currency:"VND";billingInterval:"MONTHLY"|"YEARLY";status:"ACTIVE";limits:PlanLimits;features:Record<FeatureName,boolean>}>={
  BASIC:{name:"Basic",code:"BASIC",monthlyPrice:null,yearlyPrice:null,currency:"VND",billingInterval:"MONTHLY",status:"ACTIVE",limits:{maxBarbers:3,maxServices:10,maxGalleryImages:30,maxCustomers:null,maxBookingsPerMonth:300},features:{booking:true,gallery:true,reviews:true,advanced_statistics:false,custom_domain:false,advanced_branding:false,export_reports:false}},
  PRO:{name:"Pro",code:"PRO",monthlyPrice:null,yearlyPrice:null,currency:"VND",billingInterval:"MONTHLY",status:"ACTIVE",limits:{maxBarbers:10,maxServices:50,maxGalleryImages:200,maxCustomers:null,maxBookingsPerMonth:2000},features:{booking:true,gallery:true,reviews:true,advanced_statistics:true,custom_domain:true,advanced_branding:false,export_reports:false}},
  PREMIUM:{name:"Premium",code:"PREMIUM",monthlyPrice:null,yearlyPrice:null,currency:"VND",billingInterval:"MONTHLY",status:"ACTIVE",limits:{maxBarbers:null,maxServices:null,maxGalleryImages:null,maxCustomers:null,maxBookingsPerMonth:null},features:{booking:true,gallery:true,reviews:true,advanced_statistics:true,custom_domain:true,advanced_branding:true,export_reports:true}},
};
