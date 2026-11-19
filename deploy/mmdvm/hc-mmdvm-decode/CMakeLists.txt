cmake_minimum_required(VERSION 3.16)
project(hc_mmdvm_decode CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(MBE_PREFIX "${CMAKE_PREFIX_PATH}")

find_library(MBE_LIB NAMES mbe-neo PATHS "${MBE_PREFIX}/lib" "/opt/ham-cockpit/lib" REQUIRED)
find_path(MBE_INC mbelib-neo/mbelib.h PATHS "${MBE_PREFIX}/include" "/opt/ham-cockpit/include" REQUIRED)

add_executable(hc-mmdvm-decode main.cpp decode.cpp dmr_bits.cpp)

target_include_directories(hc-mmdvm-decode PRIVATE "${MBE_INC}" ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(hc-mmdvm-decode PRIVATE "${MBE_LIB}" pthread)

install(TARGETS hc-mmdvm-decode RUNTIME DESTINATION bin)