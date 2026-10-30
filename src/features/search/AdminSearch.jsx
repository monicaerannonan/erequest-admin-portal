import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import {
  useNavigate
} from "react-router-dom";

import {
  getAdminSearchData,
  searchAdminData
} from "./adminSearchService";

import "./AdminSearch.css";


function AdminSearch() {

  const navigate =
    useNavigate();


  /* =========================================================
     STATES
     ========================================================= */

  const [query, setQuery] =
    useState("");

  const [searchData, setSearchData] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const isFetchingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* =========================================================
     LOAD SEARCH DATA (LAZY - ON FOCUS OR INPUT)
     ========================================================= */

  const loadSearchData = useCallback(async () => {
    if (searchData || isFetchingRef.current) {
      return;
    }

    try {
      isFetchingRef.current = true;
      setLoading(true);
      setErrorMessage("");

      const data = await getAdminSearchData();

      if (mountedRef.current) {
        setSearchData(data);
      }

    } catch (error) {
      console.error(
        "Failed to load admin search data:",
        error
      );

      if (mountedRef.current) {
        setErrorMessage(
          "Unable to load search data."
        );
      }

    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
      isFetchingRef.current = false;
    }
  }, [searchData]);


  /* =========================================================
     SEARCH RESULTS
     ========================================================= */

  const results =
    useMemo(() => {

      if (
        !searchData ||
        !query.trim()
      ) {

        return [];

      }


      return searchAdminData(
        searchData,
        query
      );


    }, [
      searchData,
      query
    ]);


  /* =========================================================
     OPEN RESULT
     ========================================================= */

  const handleOpenResult = (
    result
  ) => {

    if (!result.route) {
      return;
    }


    navigate(
      result.route
    );


    setQuery("");

  };


  /* =========================================================
     CLEAR SEARCH
     ========================================================= */

  const handleClearSearch = () => {

    setQuery("");

  };


  /* =========================================================
     UI
     ========================================================= */

  return (

    <div className="admin-search">


      {/* =====================================================
          SEARCH BAR
          ===================================================== */}

      <div className="admin-search-input-wrapper">
        <input
          type="text"
          className="admin-search-input"
          placeholder="Search admin records..."
          value={query}
          autoComplete="off"
          onFocus={loadSearchData}
          onChange={(event) => {
            loadSearchData();
            setQuery(
              event.target.value
            );
          }}
        />


        {query && (

          <button
            type="button"
            className="admin-search-clear"
            onClick={
              handleClearSearch
            }
            aria-label="Clear search"
            title="Clear search"
          >
            ×
          </button>

        )}


      </div>


      {/* =====================================================
          LOADING
          ===================================================== */}

      {loading && (

        <p className="admin-search-message">

          Loading search data...

        </p>

      )}


      {/* =====================================================
          ERROR
          ===================================================== */}

      {errorMessage && (

        <p className="admin-search-error">

          {errorMessage}

        </p>

      )}


      {/* =====================================================
          SEARCH RESULTS
          ===================================================== */}

      {!loading &&
        !errorMessage &&
        query.trim() && (

        <div className="admin-search-results">


          {/* RESULTS HEADER */}

          <div className="admin-search-results-header">

            <span>
              Search Results
            </span>

            <span>
              {results.length}{" "}
              {results.length === 1
                ? "result"
                : "results"}
            </span>

          </div>


          {/* NO RESULT */}

          {results.length === 0 ? (

            <div className="admin-search-empty">

              No results found for{" "}

              <strong>
                "{query}"
              </strong>

            </div>

          ) : (

            /* RESULTS */

            <div className="admin-search-result-list">


              {results.map(
                (result) => (

                  <button
                    key={
                      `${result.type}-${result.id}`
                    }
                    type="button"
                    className="admin-search-result"
                    onClick={() =>
                      handleOpenResult(
                        result
                      )
                    }
                  >


                    {/* LEFT */}

                    <div className="admin-search-result-main">


                      <span
                        className={
                          `admin-search-result-type admin-search-type-${result.type
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`
                        }
                      >

                        {result.type}

                      </span>


                      <strong className="admin-search-result-title">

                        {result.title}

                      </strong>


                      {result.subtitle && (

                        <span className="admin-search-result-subtitle">

                          {result.subtitle}

                        </span>

                      )}


                    </div>


                    {/* RIGHT */}

                    <span className="admin-search-result-open">

                      Open →

                    </span>


                  </button>

                )
              )}


            </div>

          )}


        </div>

      )}


    </div>

  );

}


export default AdminSearch;