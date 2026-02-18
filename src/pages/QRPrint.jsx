import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { QRCodeCanvas } from "qrcode.react";

export default function QRPrint() {
  const [products, setProducts] = useState([]);
  const baseUrl = window.location.origin;

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("product_id");

    if (!error) setProducts(data);
  }

  function printPage() {
    window.print();
  }

  return (
    <div className="p-6">
      {/* BUTTON - hidden while printing */}
      <div className="mb-6 print:hidden">
        <button
          onClick={printPage}
          className="bg-black text-white px-6 py-3 rounded-xl"
        >
          Print QR Labels
        </button>
      </div>

      {/* QR GRID */}
      <div className="grid grid-cols-3 gap-6">
        {products.map((product) => {
          const url = `${baseUrl}/scan/${product.product_id}`;

          return (
            <div
              key={product.id}
              className="border p-3 text-center break-inside-avoid"
            >
              <div className="text-sm font-semibold mb-2">
                {product.product_name}
              </div>

              <div className="flex justify-center mb-2">
                <QRCodeCanvas value={url} size={120} />
              </div>

              <div className="text-lg font-bold">
                {product.product_id}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
