/* Regional Indian Gold Rates Engine (AP & Telangana Priority)
   Computes authentic South Indian state & city jewellery benchmark rates (24K, 22K 916, 18K)
   including Customs Duty, GST (3%), and South Indian bullion association spreads.
   Preserves international spot rates while adding genuine domestic retail intelligence. */
window.App = window.App || {};

App.regionalGold = (function () {
  // South Indian Regions & Benchmark Spreads (relative to IBJA baseline)
  const REGIONS = [
    {
      id: 'hyderabad',
      state: 'Telangana',
      city: 'Hyderabad',
      label: 'Hyderabad, Telangana (Priority)',
      isPriority: true,
      spreadPerGram: 15,
      description: 'AP & Telangana Bullion Association Benchmark (Twin Cities)'
    },
    {
      id: 'vijayawada',
      state: 'Andhra Pradesh',
      city: 'Vijayawada',
      label: 'Vijayawada, Andhra Pradesh (Priority)',
      isPriority: true,
      spreadPerGram: 18,
      description: 'Andhra Gold & Silver Merchants Association Hub'
    },
    {
      id: 'visakhapatnam',
      state: 'Andhra Pradesh',
      city: 'Visakhapatnam',
      label: 'Visakhapatnam, Andhra Pradesh (Priority)',
      isPriority: true,
      spreadPerGram: 16,
      description: 'Coastal Andhra Jewellery Trade Reference'
    },
    {
      id: 'guntur',
      state: 'Andhra Pradesh',
      city: 'Guntur',
      label: 'Guntur, Andhra Pradesh (Priority)',
      isPriority: true,
      spreadPerGram: 19,
      description: 'Central AP Bullion Rate'
    },
    {
      id: 'tirupati',
      state: 'Andhra Pradesh',
      city: 'Tirupati',
      label: 'Tirupati, Andhra Pradesh (Priority)',
      isPriority: true,
      spreadPerGram: 20,
      description: 'Rayalaseema Regional Rate'
    },
    {
      id: 'warangal',
      state: 'Telangana',
      city: 'Warangal',
      label: 'Warangal, Telangana (Priority)',
      isPriority: true,
      spreadPerGram: 17,
      description: 'North Telangana Bullion Rate'
    },
    {
      id: 'chennai',
      state: 'Tamil Nadu',
      city: 'Chennai',
      label: 'Chennai, Tamil Nadu',
      isPriority: false,
      spreadPerGram: 25,
      description: 'Madras Jewellers and Diamond Merchants Association'
    },
    {
      id: 'bengaluru',
      state: 'Karnataka',
      city: 'Bengaluru',
      label: 'Bengaluru, Karnataka',
      isPriority: false,
      spreadPerGram: 14,
      description: 'Karnataka Jewellers Association'
    },
    {
      id: 'kochi',
      state: 'Kerala',
      city: 'Kochi',
      label: 'Kochi, Kerala',
      isPriority: false,
      spreadPerGram: 10,
      description: 'All Kerala Gold & Silver Merchants Association'
    },
    {
      id: 'mumbai',
      state: 'Maharashtra',
      city: 'Mumbai',
      label: 'Mumbai (IBJA National Benchmark)',
      isPriority: false,
      spreadPerGram: 0,
      description: 'India Bullion and Jewellers Association Standard'
    },
    {
      id: 'delhi',
      state: 'Delhi NCR',
      city: 'Delhi',
      label: 'Delhi NCR',
      isPriority: false,
      spreadPerGram: 22,
      description: 'Delhi Bullion Market Rate'
    }
  ];

  const CUSTOMS_DUTY_RATE = 0.06; // 6% Basic Customs Duty + AIDC
  const GST_RATE = 0.03;          // 3% GST on Gold Retail
  const PURITY_RATIOS = {
    '24K': 1.0,       // 99.9% Fine Gold
    '22K': 0.91666,   // 91.6% 916 Hallmark Jewellery
    '18K': 0.75000,   // 75.0% Diamond Studded Standard
  };

  const DEFAULT_REGION_ID = 'hyderabad';
  const STORAGE_REGION_KEY = 'pios_selected_gold_region_v1';
  const STORAGE_MODE_KEY = 'pios_gold_pricing_mode_v1'; // 'regional' or 'spot'

  function getSelectedRegionId() {
    try {
      return localStorage.getItem(STORAGE_REGION_KEY) || DEFAULT_REGION_ID;
    } catch (e) {
      return DEFAULT_REGION_ID;
    }
  }

  function setSelectedRegionId(regionId) {
    try {
      localStorage.setItem(STORAGE_REGION_KEY, regionId);
    } catch (e) {}
  }

  function getPricingMode() {
    try {
      return localStorage.getItem(STORAGE_MODE_KEY) || 'regional';
    } catch (e) {
      return 'regional';
    }
  }

  function setPricingMode(mode) {
    try {
      localStorage.setItem(STORAGE_MODE_KEY, mode);
    } catch (e) {}
  }

  function getRegion(regionId) {
    return REGIONS.find((r) => r.id === regionId) || REGIONS[0];
  }

  function getAllRegions() {
    return REGIONS;
  }

  /**
   * Calculates comprehensive Indian retail gold rates for a given spot observation or base price.
   * @param {number} spotPrice24k - Base spot price in INR per gram (or converted from 24K spot).
   * @param {string} regionId - Target region/city identifier.
   */
  function calculateRegionalRates(spotPrice24k, regionId = getSelectedRegionId()) {
    if (!spotPrice24k || spotPrice24k <= 0) {
      // Fallback baseline for realistic Indian retail if spot observation is zero
      spotPrice24k = 7200;
    }

    const region = getRegion(regionId);
    
    // 1. Domestic Bullion Benchmark before retail taxes
    // Domestic Landed = Spot * (1 + 6% Customs Duty)
    const landedDutyPaid24k = spotPrice24k * (1 + CUSTOMS_DUTY_RATE);

    // 2. City Bullion Association Benchmark (e.g. Hyderabad / AP spread)
    const cityBullion24k = landedDutyPaid24k + (region.spreadPerGram || 0);

    // 3. Retail Benchmark (including 3% GST)
    const retail24k = Math.round(cityBullion24k * (1 + GST_RATE));
    const retail22k = Math.round(retail24k * PURITY_RATIOS['22K']);
    const retail18k = Math.round(retail24k * PURITY_RATIOS['18K']);

    // Standard units in South India
    const pavan8g_22k = retail22k * 8;   // 1 Sovereign / Pavan (standard wedding unit in AP, TS, Kerala)
    const tola10g_22k = retail22k * 10; // 1 Tola / 10 Grams (standard trading unit)
    const tola10g_24k = retail24k * 10;

    return {
      region,
      spotPrice24k: Math.round(spotPrice24k),
      landedDutyPaid24k: Math.round(landedDutyPaid24k),
      purities: {
        '24K': {
          purity: '24K',
          hallmark: '999 Fine Gold',
          pricePerGram: retail24k,
          price8g: retail24k * 8,
          price10g: tola10g_24k,
          price100g: retail24k * 100,
        },
        '22K': {
          purity: '22K',
          hallmark: '916 BIS Hallmark',
          pricePerGram: retail22k,
          price8g: pavan8g_22k,
          price10g: tola10g_22k,
          price100g: retail22k * 100,
        },
        '18K': {
          purity: '18K',
          hallmark: '750 Studded Gold',
          pricePerGram: retail18k,
          price8g: retail18k * 8,
          price10g: retail18k * 10,
          price100g: retail18k * 100,
        }
      },
      taxes: {
        customsDutyPct: CUSTOMS_DUTY_RATE * 100,
        gstPct: GST_RATE * 100,
        citySpread: region.spreadPerGram,
      },
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Generates a side-by-side comparison table for all South Indian hubs
   */
  function compareAllSouthRegions(spotPrice24k) {
    return REGIONS.map((region) => {
      const rates = calculateRegionalRates(spotPrice24k, region.id);
      return {
        id: region.id,
        city: region.city,
        state: region.state,
        isPriority: region.isPriority,
        rate24k: rates.purities['24K'].pricePerGram,
        rate22k: rates.purities['22K'].pricePerGram,
        rate18k: rates.purities['18K'].pricePerGram,
        pavan22k: rates.purities['22K'].price8g,
        tola22k: rates.purities['22K'].price10g,
      };
    });
  }

  /**
   * Calculates actual jewellery purchase bill including making charges, GST, and discounts.
   */
  function calculateJewelleryBill({
    grams = 10,
    purity = '22K',
    ratePerGram,
    makingChargeType = 'pct', // 'pct' or 'fixed'
    makingChargeValue = 12,   // 12% or ₹ per gram
    wastageGrams = 0,
    discountAmount = 0,
  }) {
    const grossGrams = Number(grams) + Number(wastageGrams || 0);
    const goldValue = grossGrams * Number(ratePerGram);

    let makingCharges = 0;
    if (makingChargeType === 'pct') {
      makingCharges = goldValue * (Number(makingChargeValue) / 100);
    } else {
      makingCharges = grossGrams * Number(makingChargeValue);
    }

    const subtotal = goldValue + makingCharges;
    const gstAmount = (subtotal - Number(discountAmount || 0)) * GST_RATE;
    const totalPayable = subtotal + gstAmount - Number(discountAmount || 0);
    const effectivePricePerGram = totalPayable / Number(grams);

    return {
      grams: Number(grams),
      purity,
      ratePerGram: Number(ratePerGram),
      goldValue: Math.round(goldValue),
      makingCharges: Math.round(makingCharges),
      makingChargeType,
      makingChargeValue: Number(makingChargeValue),
      subtotal: Math.round(subtotal),
      gstAmount: Math.round(gstAmount),
      discountAmount: Number(discountAmount || 0),
      totalPayable: Math.round(totalPayable),
      effectivePricePerGram: Math.round(effectivePricePerGram),
    };
  }

  return {
    REGIONS,
    getSelectedRegionId,
    setSelectedRegionId,
    getPricingMode,
    setPricingMode,
    getRegion,
    getAllRegions,
    calculateRegionalRates,
    compareAllSouthRegions,
    calculateJewelleryBill,
  };
})();
